import {
  AvailabilityStatus,
  DriverEnterpriseRequestStatus,
  DriverSubscriptionPlan,
  DriverSubscriptionStatus,
  DriverProfile,
  Prisma,
  TripOfferStatus,
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
import { UpdateDriverSubscriptionDto } from './dto/update-driver-subscription.dto';

const ONLINE_GEO_KEY = 'drivers:online';
const BUSY_GEO_KEY = 'drivers:busy';
const DRIVER_TRIAL_DAYS = 90;
const STARTER_RIDE_CAP = 50;

const SUBSCRIPTION_MONTHLY_FEE: Record<DriverSubscriptionPlan, number | null> = {
  [DriverSubscriptionPlan.GO]: 1000,
  [DriverSubscriptionPlan.PRO]: 1500,
  [DriverSubscriptionPlan.ENTERPRISE]: null
};

const SUBSCRIPTION_COPY: Record<DriverSubscriptionPlan, string[]> = {
  [DriverSubscriptionPlan.GO]: [
    'INR 1000 / month after trial',
    `Up to ${STARTER_RIDE_CAP} completed rides per month`,
    'Best for part-time or new drivers'
  ],
  [DriverSubscriptionPlan.PRO]: [
    'INR 1500 / month after trial',
    'Unlimited completed rides per month',
    'Best for full-time drivers'
  ],
  [DriverSubscriptionPlan.ENTERPRISE]: [
    'Fleet-level support',
    'Contract billing and settlement',
    'High-volume booking workflows'
  ]
};

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

  private parseMoney(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return parsed;
  }

  private estimateDriverPayoutInr(order: {
    finalPrice?: unknown;
    estimatedPrice?: unknown;
    waitingCharge?: unknown;
  }) {
    const fare = this.parseMoney(order.finalPrice ?? order.estimatedPrice);
    const waitingCharge = this.parseMoney(order.waitingCharge);
    return Number((fare + waitingCharge).toFixed(2));
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
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      select: { id: true, availabilityStatus: true }
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

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
        order: {
          include: {
            payment: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const nextOrderId = await this.redis.get(`driver:${driverId}:next-order`);
    const nextOrder = nextOrderId
      ? await this.prisma.order.findUnique({
          where: { id: nextOrderId }
        })
      : null;

    const pendingOffers = await this.prisma.tripOffer.findMany({
      where: {
        driverId,
        status: TripOfferStatus.PENDING,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        order: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const pendingOffersWithPayout = pendingOffers.map((offer) => ({
      ...offer,
      estimatedDriverPayoutInr: this.estimateDriverPayoutInr(offer.order),
      currency: 'INR'
    }));

    return {
      availabilityStatus: driver.availabilityStatus,
      currentJob: currentTrip,
      nextJob: nextOrder,
      pendingOffers: pendingOffersWithPayout
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

  private resolveTrialEndsAt(driver: Pick<DriverProfile, 'createdAt' | 'trialEndsAt'>) {
    if (driver.trialEndsAt) {
      return driver.trialEndsAt;
    }

    const trialEndsAt = new Date(driver.createdAt);
    trialEndsAt.setDate(trialEndsAt.getDate() + DRIVER_TRIAL_DAYS);
    return trialEndsAt;
  }

  private buildSubscriptionCatalog() {
    const visiblePlans: DriverSubscriptionPlan[] = [
      DriverSubscriptionPlan.GO,
      DriverSubscriptionPlan.PRO
    ];

    return visiblePlans.map((plan) => ({
      plan,
      monthlyFeeInr: SUBSCRIPTION_MONTHLY_FEE[plan],
      billing: 'monthly',
      features: SUBSCRIPTION_COPY[plan]
    }));
  }

  private async loadDriverSubscriptionContext(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      include: {
        user: true,
        enterpriseRequests: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    return driver;
  }

  async getSubscription(driverId: string) {
    const driver = await this.loadDriverSubscriptionContext(driverId);
    const trialEndsAt = this.resolveTrialEndsAt(driver);
    const now = new Date();
    const trialActive = now.getTime() <= trialEndsAt.getTime();
    const daysLeft = trialActive
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;
    const latestEnterpriseRequest = driver.enterpriseRequests[0];

    return {
      driverId: driver.id,
      current: {
        plan: driver.subscriptionPlan,
        status: driver.subscriptionStatus,
        monthlyFeeInr: SUBSCRIPTION_MONTHLY_FEE[driver.subscriptionPlan],
        trial: {
          isActive: trialActive,
          endsAt: trialEndsAt,
          daysLeft
        }
      },
      options: this.buildSubscriptionCatalog(),
      enterpriseRequest: latestEnterpriseRequest
        ? {
            id: latestEnterpriseRequest.id,
            status: latestEnterpriseRequest.status,
            createdAt: latestEnterpriseRequest.createdAt,
            notes: latestEnterpriseRequest.notes
          }
        : null
    };
  }

  async updateSubscriptionPlan(driverId: string, payload: UpdateDriverSubscriptionDto) {
    const { plan } = payload;
    const driver = await this.loadDriverSubscriptionContext(driverId);

    const trialEndsAt = this.resolveTrialEndsAt(driver);

    if (driver.subscriptionPlan === plan) {
      return {
        changed: false,
        message: `You are already on ${plan}.`,
        driverId: driver.id,
        plan: driver.subscriptionPlan,
        status: driver.subscriptionStatus,
        trialEndsAt
      };
    }

    if (plan === DriverSubscriptionPlan.ENTERPRISE) {
      const existingPending = driver.enterpriseRequests.find(
        (request) => request.status === DriverEnterpriseRequestStatus.PENDING
      );

      const enterpriseRequest = existingPending
        ? await this.prisma.driverEnterprisePlanRequest.update({
            where: { id: existingPending.id },
            data: {
              contactName: payload.contactName ?? existingPending.contactName ?? driver.user.name,
              contactPhone: payload.contactPhone ?? existingPending.contactPhone ?? driver.user.phone,
              city: payload.city ?? existingPending.city,
              fleetSize: payload.fleetSize ?? existingPending.fleetSize,
              notes: payload.notes ?? existingPending.notes
            }
          })
        : await this.prisma.driverEnterprisePlanRequest.create({
            data: {
              driverId: driver.id,
              status: DriverEnterpriseRequestStatus.PENDING,
              contactName: payload.contactName ?? driver.user.name,
              contactPhone: payload.contactPhone ?? driver.user.phone,
              city: payload.city,
              fleetSize: payload.fleetSize,
              notes: payload.notes
            }
          });

      const updated = await this.prisma.driverProfile.update({
        where: { id: driver.id },
        data: {
          subscriptionPlan: DriverSubscriptionPlan.ENTERPRISE,
          subscriptionStatus: DriverSubscriptionStatus.ACTIVE,
          trialEndsAt
        }
      });

      return {
        changed: true,
        requiresSalesFollowup: true,
        message: 'Enterprise upgrade submitted. Our team will contact you shortly.',
        driverId: updated.id,
        plan: updated.subscriptionPlan,
        status: updated.subscriptionStatus,
        trialEndsAt: updated.trialEndsAt,
        enterpriseRequest: {
          id: enterpriseRequest.id,
          status: enterpriseRequest.status,
          createdAt: enterpriseRequest.createdAt
        }
      };
    }

    const updated = await this.prisma.driverProfile.update({
      where: { id: driver.id },
      data: {
        subscriptionPlan: plan,
        subscriptionStatus: DriverSubscriptionStatus.ACTIVE,
        trialEndsAt
      }
    });

    await this.prisma.driverEnterprisePlanRequest.updateMany({
      where: {
        driverId: driver.id,
        status: DriverEnterpriseRequestStatus.PENDING
      },
      data: {
        status: DriverEnterpriseRequestStatus.REJECTED,
        resolvedAt: new Date(),
        notes: 'Auto-closed after driver switched to a non-enterprise plan.'
      }
    });

    return {
      changed: true,
      message: `Plan switched to ${updated.subscriptionPlan}.`,
      driverId: updated.id,
      plan: updated.subscriptionPlan,
      status: updated.subscriptionStatus,
      trialEndsAt: updated.trialEndsAt
    };
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
        const commission = 0;
        const payout = Number((fare + waiting).toFixed(2));

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

    const now = new Date();
    const trialEndsAt = this.resolveTrialEndsAt(driver);
    const trialActive = now.getTime() <= trialEndsAt.getTime();
    const daysLeft = trialActive
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;
    const monthlyFee = SUBSCRIPTION_MONTHLY_FEE[driver.subscriptionPlan];
    const includesToday = from.getTime() <= now.getTime() && to.getTime() >= now.getTime();
    let subscriptionFeeInRange = !trialActive && includesToday && monthlyFee ? monthlyFee : 0;
    const starterLimitExceeded =
      driver.subscriptionPlan === DriverSubscriptionPlan.GO &&
      completedTrips.length > STARTER_RIDE_CAP;

    if (
      !trialActive &&
      includesToday &&
      starterLimitExceeded &&
      SUBSCRIPTION_MONTHLY_FEE[DriverSubscriptionPlan.PRO]
    ) {
      subscriptionFeeInRange = SUBSCRIPTION_MONTHLY_FEE[DriverSubscriptionPlan.PRO] ?? subscriptionFeeInRange;
    }

    const roundedSummary = {
      grossFare: Number(summary.grossFare.toFixed(2)),
      waitingCharges: Number(summary.waitingCharges.toFixed(2)),
      commission: Number(summary.commission.toFixed(2)),
      subscriptionFee: Number(subscriptionFeeInRange.toFixed(2)),
      netPayout: Number(summary.netPayout.toFixed(2)),
      takeHomeAfterSubscription: Number((summary.netPayout - subscriptionFeeInRange).toFixed(2))
    };

    return {
      driverId,
      from,
      to,
      tripCount: completedTrips.length,
      currency: 'INR',
      summary: roundedSummary,
      subscription: {
        plan: driver.subscriptionPlan,
        status: driver.subscriptionStatus,
        monthlyFeeInr: monthlyFee,
        trial: {
          isActive: trialActive,
          endsAt: trialEndsAt,
          daysLeft
        },
        note: trialActive
          ? `Trial active: drivers keep 100% ride earnings for first ${DRIVER_TRIAL_DAYS} days.`
          : driver.subscriptionPlan === DriverSubscriptionPlan.GO
            ? starterLimitExceeded
              ? `Starter plan crossed ${STARTER_RIDE_CAP} rides in current period. Billing adjusted to INR ${
                  SUBSCRIPTION_MONTHLY_FEE[DriverSubscriptionPlan.PRO] ?? 1500
                } for unlimited usage.`
              : `Starter plan: INR ${monthlyFee ?? 1000} per month for up to ${STARTER_RIDE_CAP} completed rides.`
            : driver.subscriptionPlan === DriverSubscriptionPlan.PRO
              ? `Unlimited plan: INR ${monthlyFee ?? 1500} per month with no ride cap.`
          : driver.subscriptionPlan === DriverSubscriptionPlan.ENTERPRISE
            ? 'Enterprise plan billing is managed by sales contracts.'
            : `Monthly subscription fee: INR ${monthlyFee ?? 0}.`
      },
      recentTrips: completedTrips.map((trip) => ({
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
