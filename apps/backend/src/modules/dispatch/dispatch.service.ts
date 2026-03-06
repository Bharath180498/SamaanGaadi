import { Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityStatus, OrderStatus, TripStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DriversService } from '../drivers/drivers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DISPATCH_WEIGHTS } from '@porter/shared';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly driversService: DriversService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeService: RealtimeService,
    private readonly redisService: RedisService
  ) {}

  private get dispatchRadiusKm() {
    return this.configService.get<number>('dispatchRadiusKm') ?? 8;
  }

  private get redis() {
    return this.redisService.getClient();
  }

  private computeDistanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
    const toRadians = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(to.lat - from.lat);
    const dLng = toRadians(to.lng - from.lng);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private scoreDriver(input: {
    distanceKm: number;
    rating: number;
    idleSince?: Date | null;
    vehicleMatch: boolean;
    radiusKm: number;
  }) {
    const proximity = Math.max(0, 1 - input.distanceKm / input.radiusKm);
    const rating = Math.min(1, Math.max(0, input.rating / 5));

    const idleHours = input.idleSince
      ? (Date.now() - new Date(input.idleSince).getTime()) / (60 * 60 * 1000)
      : 0;
    const idleTime = Math.min(1, idleHours / 4);
    const vehicle = input.vehicleMatch ? 1 : 0;

    const total =
      DISPATCH_WEIGHTS.proximity * proximity +
      DISPATCH_WEIGHTS.rating * rating +
      DISPATCH_WEIGHTS.idleTime * idleTime +
      DISPATCH_WEIGHTS.vehicleMatch * vehicle;

    return {
      proximity,
      rating,
      idleTime,
      vehicle,
      total
    };
  }

  async previewCandidates(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const nearbyDrivers = await this.driversService.findNearby({
      lat: order.pickupLat,
      lng: order.pickupLng,
      radiusKm: this.dispatchRadiusKm,
      vehicleType: order.vehicleType,
      includeBusy: true
    });

    return nearbyDrivers
      .map((driver) => {
        const score = this.scoreDriver({
          distanceKm: driver.distanceKm,
          rating: driver.user.rating,
          idleSince: driver.idleSince,
          vehicleMatch: driver.vehicleType === order.vehicleType,
          radiusKm: this.dispatchRadiusKm
        });

        return {
          driverId: driver.id,
          driverName: driver.user.name,
          availabilityStatus: driver.availabilityFromGeo,
          distanceKm: driver.distanceKm,
          score
        };
      })
      .sort((a, b) => b.score.total - a.score.total);
  }

  async assignOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const existingTrip = await this.prisma.trip.findUnique({ where: { orderId: order.id } });
    if (existingTrip) {
      return {
        orderId: order.id,
        assigned: true,
        tripId: existingTrip.id,
        driverId: existingTrip.driverId,
        mode: 'EXISTING'
      };
    }

    const candidates = await this.previewCandidates(order.id);

    if (candidates.length === 0) {
      return {
        orderId: order.id,
        assigned: false,
        reason: 'NO_DRIVERS_FOUND'
      };
    }

    const onlineCandidate = candidates.find(
      (candidate) => candidate.availabilityStatus === AvailabilityStatus.ONLINE
    );

    if (onlineCandidate) {
      const trip = await this.prisma.$transaction(async (tx) => {
        await tx.driverProfile.update({
          where: { id: onlineCandidate.driverId },
          data: {
            availabilityStatus: AvailabilityStatus.BUSY,
            idleSince: null
          }
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.ASSIGNED
          }
        });

        return tx.trip.create({
          data: {
            orderId: order.id,
            driverId: onlineCandidate.driverId,
            etaMinutes: Math.max(5, Math.round((onlineCandidate.distanceKm / 25) * 60)),
            status: TripStatus.ASSIGNED
          }
        });
      });

      await this.notificationsService.notifyCustomer(order.customerId, 'driver_assigned', {
        orderId: order.id,
        driverId: onlineCandidate.driverId,
        etaMinutes: trip.etaMinutes
      });

      await this.notificationsService.notifyDriver(onlineCandidate.driverId, 'new_job_assigned', {
        orderId: order.id,
        tripId: trip.id
      });

      this.realtimeService.emitTripUpdate(order.id, 'trip:assigned', {
        tripId: trip.id,
        driverId: onlineCandidate.driverId,
        etaMinutes: trip.etaMinutes
      });

      return {
        orderId: order.id,
        assigned: true,
        mode: 'IMMEDIATE',
        tripId: trip.id,
        driverId: onlineCandidate.driverId
      };
    }

    const busyCandidate = candidates[0];

    const nextKey = `driver:${busyCandidate.driverId}:next-order`;
    const hasQueuedOrder = await this.redis.get(nextKey);

    if (hasQueuedOrder) {
      return {
        orderId: order.id,
        assigned: false,
        reason: 'DRIVER_ALREADY_HAS_QUEUED_JOB'
      };
    }

    const queuedTrip = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.ASSIGNED
        }
      });

      return tx.trip.create({
        data: {
          orderId: order.id,
          driverId: busyCandidate.driverId,
          status: TripStatus.ASSIGNED
        }
      });
    });

    await this.redis.set(nextKey, order.id, 'EX', 45 * 60);

    await this.notificationsService.notifyDriver(busyCandidate.driverId, 'next_job_queued', {
      orderId: order.id,
      tripId: queuedTrip.id
    });

    this.realtimeService.emitDriverUpdate(busyCandidate.driverId, 'driver:next-job', {
      orderId: order.id,
      tripId: queuedTrip.id
    });

    return {
      orderId: order.id,
      assigned: true,
      mode: 'QUEUED',
      tripId: queuedTrip.id,
      driverId: busyCandidate.driverId
    };
  }

  async queueNextJobForDriver(driverId: string, currentTripId: string) {
    const key = `driver:${driverId}:next-order`;
    const existing = await this.redis.get(key);

    if (existing) {
      return {
        queued: true,
        orderId: existing,
        reason: 'ALREADY_QUEUED'
      };
    }

    const currentTrip = await this.prisma.trip.findUnique({
      where: { id: currentTripId },
      include: { order: true, driver: true }
    });

    if (!currentTrip) {
      throw new NotFoundException('Current trip not found');
    }

    const openOrders = await this.prisma.order.findMany({
      where: {
        status: {
          in: [OrderStatus.CREATED, OrderStatus.MATCHING]
        },
        vehicleType: currentTrip.order.vehicleType,
        id: {
          not: currentTrip.orderId
        }
      },
      take: 50,
      orderBy: { createdAt: 'asc' }
    });

    const scored = openOrders
      .map((order) => ({
        order,
        distanceKm: this.computeDistanceKm(
          { lat: currentTrip.order.dropLat, lng: currentTrip.order.dropLng },
          { lat: order.pickupLat, lng: order.pickupLng }
        )
      }))
      .filter((entry) => entry.distanceKm <= 10)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const next = scored[0];
    if (!next) {
      return {
        queued: false,
        reason: 'NO_QUALIFIED_ORDER'
      };
    }

    const trip = await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: next.order.id },
        data: {
          status: OrderStatus.ASSIGNED
        }
      });

      return tx.trip.create({
        data: {
          orderId: next.order.id,
          driverId,
          status: TripStatus.ASSIGNED
        }
      });
    });

    await this.redis.set(key, next.order.id, 'EX', 45 * 60);

    await this.notificationsService.notifyDriver(driverId, 'next_job_queued', {
      orderId: next.order.id,
      tripId: trip.id
    });

    return {
      queued: true,
      orderId: next.order.id,
      tripId: trip.id,
      distanceKm: Number(next.distanceKm.toFixed(2))
    };
  }

  async activateQueuedJob(driverId: string) {
    const key = `driver:${driverId}:next-order`;
    const orderId = await this.redis.get(key);

    if (!orderId) {
      return {
        activated: false,
        reason: 'NO_QUEUED_ORDER'
      };
    }

    const trip = await this.prisma.trip.findFirst({
      where: {
        driverId,
        orderId,
        status: TripStatus.ASSIGNED
      }
    });

    if (!trip) {
      await this.redis.del(key);
      return {
        activated: false,
        reason: 'QUEUED_TRIP_NOT_FOUND'
      };
    }

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: TripStatus.DRIVER_EN_ROUTE,
        pickupTime: new Date()
      }
    });

    await this.redis.del(key);

    this.realtimeService.emitDriverUpdate(driverId, 'driver:next-job-activated', {
      tripId: updated.id,
      orderId
    });

    return {
      activated: true,
      tripId: updated.id,
      orderId
    };
  }

  async runScheduledDispatch() {
    const now = new Date();
    const scheduledOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.CREATED,
        scheduledAt: {
          lte: now
        }
      },
      take: 100,
      orderBy: { scheduledAt: 'asc' }
    });

    const results = await Promise.all(
      scheduledOrders.map(async (order) => {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.MATCHING
          }
        });

        const assignment = await this.assignOrder(order.id);
        return {
          orderId: order.id,
          assignment
        };
      })
    );

    return {
      processed: scheduledOrders.length,
      results
    };
  }
}
