import {
  AvailabilityStatus,
  DriverProfile,
  Prisma,
  TripStatus,
  VehicleType,
  VerificationStatus
} from '@prisma/client';
import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { DriverEarningsQueryDto } from './dto/driver-earnings-query.dto';

const ONLINE_GEO_KEY = 'drivers:online';
const BUSY_GEO_KEY = 'drivers:busy';

@Injectable()
export class DriversService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly realtimeService: RealtimeService
  ) {}

  private get redis() {
    return this.redisService.getClient();
  }

  async onModuleInit() {
    await this.rebuildGeoIndexes();
  }

  private async rebuildGeoIndexes() {
    await this.redis.del(ONLINE_GEO_KEY);
    await this.redis.del(BUSY_GEO_KEY);

    const activeDrivers = await this.prisma.driverProfile.findMany({
      where: {
        availabilityStatus: {
          in: [AvailabilityStatus.ONLINE, AvailabilityStatus.BUSY]
        },
        currentLat: {
          not: null
        },
        currentLng: {
          not: null
        },
        verificationStatus: VerificationStatus.APPROVED
      }
    });

    const entries = activeDrivers.filter(
      (
        driver
      ): driver is DriverProfile & {
        currentLat: number;
        currentLng: number;
      } => driver.currentLat !== null && driver.currentLng !== null
    );

    for (const driver of entries) {
      await this.syncGeoIndex(driver.id, driver.currentLat, driver.currentLng, driver.availabilityStatus);
    }
  }

  private async syncGeoIndex(
    driverId: string,
    lat: number,
    lng: number,
    availabilityStatus: AvailabilityStatus
  ) {
    await this.redis.zrem(ONLINE_GEO_KEY, driverId);
    await this.redis.zrem(BUSY_GEO_KEY, driverId);

    if (availabilityStatus === AvailabilityStatus.ONLINE) {
      await this.redis.geoadd(ONLINE_GEO_KEY, lng, lat, driverId);
    }

    if (availabilityStatus === AvailabilityStatus.BUSY) {
      await this.redis.geoadd(BUSY_GEO_KEY, lng, lat, driverId);
    }
  }

  async updateLocation(payload: UpdateDriverLocationDto) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { id: payload.driverId } });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const updated = await this.prisma.driverProfile.update({
      where: { id: payload.driverId },
      data: {
        currentLat: payload.latitude,
        currentLng: payload.longitude,
        lastActiveAt: new Date(payload.timestamp)
      }
    });

    await this.syncGeoIndex(
      updated.id,
      payload.latitude,
      payload.longitude,
      updated.availabilityStatus
    );

    this.realtimeService.emitDriverLocation({
      driverId: payload.driverId,
      orderId: payload.orderId,
      lat: payload.latitude,
      lng: payload.longitude,
      timestamp: payload.timestamp
    });

    if (payload.orderId) {
      const historyKey = `order:${payload.orderId}:locations`;
      await this.redis.lpush(
        historyKey,
        JSON.stringify({
          driverId: payload.driverId,
          lat: payload.latitude,
          lng: payload.longitude,
          timestamp: payload.timestamp
        })
      );
      await this.redis.ltrim(historyKey, 0, 499);
      await this.redis.expire(historyKey, 7 * 24 * 60 * 60);
    }

    return {
      success: true,
      driverId: updated.id,
      availabilityStatus: updated.availabilityStatus
    };
  }

  async setAvailability(driverId: string, status: AvailabilityStatus) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const updated = await this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        availabilityStatus: status,
        idleSince:
          status === AvailabilityStatus.ONLINE
            ? new Date()
            : status === AvailabilityStatus.BUSY
              ? driver.idleSince
              : null
      }
    });

    if (driver.currentLat !== null && driver.currentLat !== undefined && driver.currentLng !== null && driver.currentLng !== undefined) {
      await this.syncGeoIndex(driverId, driver.currentLat, driver.currentLng, status);
    }

    return updated;
  }

  private async fetchGeoDrivers(
    key: string,
    lat: number,
    lng: number,
    radiusKm: number
  ): Promise<Array<{ driverId: string; distanceKm: number }>> {
    const results = (await this.redis.georadius(
      key,
      lng,
      lat,
      radiusKm,
      'km',
      'WITHDIST',
      'ASC'
    )) as Array<[string, string]>;

    return results.map(([driverId, distance]) => ({
      driverId,
      distanceKm: Number(distance)
    }));
  }

  async findNearby(input: {
    lat: number;
    lng: number;
    radiusKm: number;
    vehicleType?: string;
    minRating?: number;
    includeBusy?: boolean;
  }) {
    const onlineGeo = await this.fetchGeoDrivers(ONLINE_GEO_KEY, input.lat, input.lng, input.radiusKm);

    const busyGeo = input.includeBusy
      ? await this.fetchGeoDrivers(BUSY_GEO_KEY, input.lat, input.lng, input.radiusKm)
      : [];

    const geoMap = new Map<string, { distanceKm: number; availability: AvailabilityStatus }>();

    for (const item of onlineGeo) {
      geoMap.set(item.driverId, {
        distanceKm: item.distanceKm,
        availability: AvailabilityStatus.ONLINE
      });
    }

    for (const item of busyGeo) {
      if (!geoMap.has(item.driverId)) {
        geoMap.set(item.driverId, {
          distanceKm: item.distanceKm,
          availability: AvailabilityStatus.BUSY
        });
      }
    }

    if (geoMap.size === 0) {
      return [];
    }

    const where: Prisma.DriverProfileWhereInput = {
      id: {
        in: [...geoMap.keys()]
      },
      verificationStatus: VerificationStatus.APPROVED,
      ...(typeof input.minRating === 'number'
        ? {
            user: {
              rating: {
                gte: input.minRating
              }
            }
          }
        : {}),
      ...(input.vehicleType ? { vehicleType: input.vehicleType as VehicleType } : {})
    };

    const drivers = await this.prisma.driverProfile.findMany({
      where,
      include: {
        user: true
      }
    });

    return drivers.map((driver) => ({
      ...driver,
      distanceKm: geoMap.get(driver.id)?.distanceKm ?? 999,
      availabilityFromGeo: geoMap.get(driver.id)?.availability ?? driver.availabilityStatus
    }));
  }

  async getDriverJobs(driverId: string) {
    const currentTrip = await this.prisma.trip.findFirst({
      where: {
        driverId,
        status: {
          in: [
            TripStatus.ASSIGNED,
            TripStatus.DRIVER_EN_ROUTE,
            TripStatus.ARRIVED_PICKUP,
            TripStatus.LOADING,
            TripStatus.IN_TRANSIT
          ]
        }
      },
      include: {
        order: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const nextOrderId = await this.redis.get(`driver:${driverId}:next-order`);
    const nextOrder = nextOrderId
      ? await this.prisma.order.findUnique({
          where: { id: nextOrderId }
        })
      : null;

    return {
      currentJob: currentTrip,
      nextJob: nextOrder
    };
  }

  pendingApprovals() {
    return this.prisma.driverProfile.findMany({
      where: { verificationStatus: VerificationStatus.PENDING },
      include: { user: true, vehicles: true },
      orderBy: { createdAt: 'asc' }
    });
  }

  async approve(driverId: string) {
    return this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        verificationStatus: VerificationStatus.APPROVED,
        availabilityStatus: AvailabilityStatus.OFFLINE
      }
    });
  }

  async reject(driverId: string) {
    return this.prisma.driverProfile.update({
      where: { id: driverId },
      data: {
        verificationStatus: VerificationStatus.REJECTED,
        availabilityStatus: AvailabilityStatus.OFFLINE
      }
    });
  }

  async earnings(driverId: string, query: DriverEarningsQueryDto) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();

    const completedTrips = await this.prisma.trip.findMany({
      where: {
        driverId,
        status: TripStatus.COMPLETED,
        deliveryTime: {
          gte: from,
          lte: to
        }
      },
      include: {
        order: true
      },
      orderBy: { deliveryTime: 'desc' }
    });

    const summary = completedTrips.reduce(
      (acc, trip) => {
        const fare = Number(trip.order.finalPrice ?? trip.order.estimatedPrice);
        const waiting = Number(trip.waitingCharge);
        const commission = Number((fare * 0.2).toFixed(2));
        const payout = Number((fare - commission).toFixed(2));

        acc.grossFare += fare;
        acc.waitingCharges += waiting;
        acc.commission += commission;
        acc.netPayout += payout;
        return acc;
      },
      {
        grossFare: 0,
        waitingCharges: 0,
        commission: 0,
        netPayout: 0
      }
    );

    return {
      driverId,
      from,
      to,
      tripCount: completedTrips.length,
      currency: 'INR',
      summary: Object.fromEntries(
        Object.entries(summary).map(([key, value]) => [key, Number(value.toFixed(2))])
      ),
      recentTrips: completedTrips.slice(0, 20).map((trip) => ({
        tripId: trip.id,
        orderId: trip.orderId,
        deliveredAt: trip.deliveryTime,
        distanceKm: trip.distanceKm,
        durationMinutes: trip.durationMinutes,
        fare: Number(trip.order.finalPrice ?? trip.order.estimatedPrice),
        waitingCharge: Number(trip.waitingCharge)
      }))
    };
  }
}
