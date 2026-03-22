import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AvailabilityStatus,
  DispatchDecision,
  Order,
  OrderStatus,
  Prisma,
  TripOfferStatus,
  TripStatus,
  VehicleMatchType,
  VehicleType
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DriversService } from '../drivers/drivers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RedisService } from '../../common/redis/redis.service';
import { RouteEtaService } from './route-eta.service';
import {
  buildTripStartOtpRedisKey,
  generateTripStartOtpCode,
  TRIP_START_OTP_TTL_SECONDS
} from '../../common/utils/trip-start-otp.util';

interface CandidateScore {
  etaScore: number;
  ratingScore: number;
  idleScore: number;
  vehicleFitScore: number;
  assignmentPenalty: number;
  reliabilityPenalty: number;
  freshnessPenalty: number;
  availabilityPenalty: number;
  finalPenalty: number;
  total: number;
}

interface DispatchCandidate {
  driverId: string;
  driverName: string;
  availabilityStatus: AvailabilityStatus;
  vehicleType: VehicleType;
  vehicleMatchType: VehicleMatchType;
  distanceKm: number;
  routeEtaMinutes: number;
  routeProvider: 'google' | 'mock';
  lastActiveAt: Date | null;
  recentAssignmentsLast60m?: number;
  recentOfferMissesLast24h?: number;
  hasQueuedOrder?: boolean;
  pendingOfferCount?: number;
  score: CandidateScore;
}

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly driversService: DriversService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeService: RealtimeService,
    private readonly redisService: RedisService,
    private readonly routeEtaService: RouteEtaService
  ) {}

  private get dispatchRadiusKm() {
    return this.configService.get<number>('dispatchRadiusKm') ?? 8;
  }

  private get offerExpirySeconds() {
    return 120;
  }

  private get busyFallbackMaxEtaMinutes() {
    return 18;
  }

  private get busyFallbackMaxDistanceKm() {
    return this.dispatchRadiusKm;
  }

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

  private vehicleRank(vehicleType: VehicleType) {
    if (vehicleType === VehicleType.THREE_WHEELER) {
      return 1;
    }
    if (vehicleType === VehicleType.MINI_TRUCK) {
      return 2;
    }
    return 3;
  }

  private vehicleMatchType(orderVehicleType: VehicleType, driverVehicleType: VehicleType) {
    if (orderVehicleType === driverVehicleType) {
      return VehicleMatchType.EXACT;
    }

    return this.vehicleRank(driverVehicleType) > this.vehicleRank(orderVehicleType)
      ? VehicleMatchType.UPGRADE
      : null;
  }

  private scoreCandidate(input: {
    etaMinutes: number;
    rating: number;
    idleSince?: Date | null;
    vehicleMatchType: VehicleMatchType;
  }): CandidateScore {
    const etaScore = Math.max(0, Math.min(1, 1 - input.etaMinutes / 35));
    const ratingScore = Math.max(0, Math.min(1, input.rating / 5));
    const idleHours = input.idleSince
      ? (Date.now() - new Date(input.idleSince).getTime()) / (60 * 60 * 1000)
      : 0;
    const idleScore = Math.max(0, Math.min(1, idleHours / 4));
    const vehicleFitScore = input.vehicleMatchType === VehicleMatchType.EXACT ? 1 : 0.75;

    const total =
      0.55 * etaScore + 0.2 * ratingScore + 0.15 * idleScore + 0.1 * vehicleFitScore;

    return {
      etaScore: Number(etaScore.toFixed(4)),
      ratingScore: Number(ratingScore.toFixed(4)),
      idleScore: Number(idleScore.toFixed(4)),
      vehicleFitScore,
      assignmentPenalty: 0,
      reliabilityPenalty: 0,
      freshnessPenalty: 0,
      availabilityPenalty: 0,
      finalPenalty: 0,
      total: Number(total.toFixed(4))
    };
  }

  private async applyFairnessAdjustments(candidates: DispatchCandidate[]) {
    if (candidates.length === 0) {
      return candidates;
    }

    const driverIds = [...new Set(candidates.map((candidate) => candidate.driverId))];
    const assignmentSince = new Date(Date.now() - 60 * 60 * 1000);
    const missesSince = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentAssignments, recentMisses] = await Promise.all([
      this.prisma.trip.groupBy({
        by: ['driverId'],
        where: {
          driverId: {
            in: driverIds
          },
          createdAt: {
            gte: assignmentSince
          },
          status: {
            in: [
              TripStatus.ASSIGNED,
              TripStatus.DRIVER_EN_ROUTE,
              TripStatus.ARRIVED_PICKUP,
              TripStatus.LOADING,
              TripStatus.IN_TRANSIT,
              TripStatus.COMPLETED
            ]
          }
        },
        _count: {
          _all: true
        }
      }),
      this.prisma.tripOffer.groupBy({
        by: ['driverId'],
        where: {
          driverId: {
            in: driverIds
          },
          status: {
            in: [TripOfferStatus.REJECTED, TripOfferStatus.EXPIRED]
          },
          respondedAt: {
            gte: missesSince
          }
        },
        _count: {
          _all: true
        }
      })
    ]);

    const recentAssignmentMap = new Map(
      recentAssignments.map((entry) => [entry.driverId, entry._count._all])
    );
    const recentMissMap = new Map(recentMisses.map((entry) => [entry.driverId, entry._count._all]));

    return candidates
      .map((candidate) => {
        const assignmentCount = recentAssignmentMap.get(candidate.driverId) ?? 0;
        const missCount = recentMissMap.get(candidate.driverId) ?? 0;

        const assignmentPenalty = Math.min(0.22, assignmentCount * 0.04);
        const reliabilityPenalty = Math.min(0.12, missCount * 0.02);
        const freshnessPenalty = (() => {
          if (!candidate.lastActiveAt) {
            return 0.08;
          }
          const minutesSinceActive = (Date.now() - candidate.lastActiveAt.getTime()) / (60 * 1000);
          if (minutesSinceActive <= 5) {
            return 0;
          }
          return Math.min(0.14, ((minutesSinceActive - 5) / 15) * 0.14);
        })();
        const availabilityPenalty =
          candidate.availabilityStatus === AvailabilityStatus.BUSY ? 0.06 : 0;

        const finalPenalty = assignmentPenalty + reliabilityPenalty + freshnessPenalty + availabilityPenalty;
        const adjustedTotal = Math.max(0, Math.min(1, candidate.score.total - finalPenalty));

        return {
          ...candidate,
          recentAssignmentsLast60m: assignmentCount,
          recentOfferMissesLast24h: missCount,
          score: {
            ...candidate.score,
            assignmentPenalty: Number(assignmentPenalty.toFixed(4)),
            reliabilityPenalty: Number(reliabilityPenalty.toFixed(4)),
            freshnessPenalty: Number(freshnessPenalty.toFixed(4)),
            availabilityPenalty: Number(availabilityPenalty.toFixed(4)),
            finalPenalty: Number(finalPenalty.toFixed(4)),
            total: Number(adjustedTotal.toFixed(4))
          }
        };
      })
      .sort((a, b) => b.score.total - a.score.total);
  }

  private async decorateQueueAndPendingState(candidates: DispatchCandidate[]) {
    if (candidates.length === 0) {
      return candidates;
    }

    const driverIds = [...new Set(candidates.map((candidate) => candidate.driverId))];
    const queueKeys = driverIds.map((driverId) => `driver:${driverId}:next-order`);
    const queueValues = queueKeys.length > 0 ? await this.redis.mget(...queueKeys) : [];
    const queuedMap = new Map(driverIds.map((driverId, index) => [driverId, Boolean(queueValues[index])]));

    const pendingOffers = await this.prisma.tripOffer.groupBy({
      by: ['driverId'],
      where: {
        driverId: {
          in: driverIds
        },
        status: TripOfferStatus.PENDING,
        expiresAt: {
          gt: new Date()
        }
      },
      _count: {
        _all: true
      }
    });

    const pendingOfferMap = new Map(pendingOffers.map((entry) => [entry.driverId, entry._count._all]));

    return candidates.map((candidate) => ({
      ...candidate,
      hasQueuedOrder: queuedMap.get(candidate.driverId) ?? false,
      pendingOfferCount: pendingOfferMap.get(candidate.driverId) ?? 0
    }));
  }

  private async buildCandidates(order: Order): Promise<DispatchCandidate[]> {
    const nearbyDrivers = await this.driversService.findNearby({
      lat: order.pickupLat,
      lng: order.pickupLng,
      radiusKm: this.dispatchRadiusKm,
      includeBusy: true
    });

    const candidates = await Promise.all(
      nearbyDrivers.map(async (driver) => {
        const matchType = this.vehicleMatchType(order.vehicleType, driver.vehicleType);
        if (!matchType) {
          return null;
        }

        const lat = driver.currentLat ?? order.pickupLat;
        const lng = driver.currentLng ?? order.pickupLng;
        const eta = await this.routeEtaService.getEta({
          origin: { lat, lng },
          destination: { lat: order.pickupLat, lng: order.pickupLng },
          vehicleType: driver.vehicleType
        });

        const score = this.scoreCandidate({
          etaMinutes: eta.etaMinutes,
          rating: driver.user.rating,
          idleSince: driver.idleSince,
          vehicleMatchType: matchType
        });

        return {
          driverId: driver.id,
          driverName: driver.user.name,
          availabilityStatus: driver.availabilityFromGeo,
          vehicleType: driver.vehicleType,
          vehicleMatchType: matchType,
          distanceKm: Number((driver.distanceKm ?? eta.distanceKm).toFixed(2)),
          routeEtaMinutes: eta.etaMinutes,
          routeProvider: eta.provider,
          lastActiveAt: driver.lastActiveAt ?? null,
          score
        } satisfies DispatchCandidate;
      })
    );

    const filtered = candidates.filter(
      (candidate): candidate is DispatchCandidate => candidate !== null
    );
    const fairnessAdjusted = await this.applyFairnessAdjustments(filtered);
    return this.decorateQueueAndPendingState(fairnessAdjusted);
  }

  private async logDecision(data: {
    orderId: string;
    selectedDriverId?: string | null;
    offerId?: string | null;
    assignmentMode: string;
    routeEtaMinutes?: number | null;
    vehicleMatchType?: VehicleMatchType | null;
    totalScore?: number | null;
    decisionPayload?: Record<string, unknown>;
    reason?: string;
  }) {
    return this.prisma.dispatchDecision.create({
      data: {
        orderId: data.orderId,
        selectedDriverId: data.selectedDriverId ?? null,
        offerId: data.offerId ?? null,
        assignmentMode: data.assignmentMode,
        routeEtaMinutes: data.routeEtaMinutes ?? null,
        vehicleMatchType: data.vehicleMatchType ?? null,
        totalScore: data.totalScore ?? null,
        decisionPayload: data.decisionPayload as Prisma.InputJsonValue | undefined,
        reason: data.reason
      }
    });
  }

  async previewCandidates(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.buildCandidates(order);
  }

  private async createOffer(input: {
    order: Order;
    candidate: DispatchCandidate;
    mode: 'NEW_ASSIGNMENT' | 'REASSIGNMENT' | 'QUEUE_OFFER';
    linkedTripId?: string;
  }) {
    const expiresAt = new Date(Date.now() + this.offerExpirySeconds * 1000);
    const offer = await this.prisma.tripOffer.create({
      data: {
        orderId: input.order.id,
        tripId: input.linkedTripId,
        driverId: input.candidate.driverId,
        status: TripOfferStatus.PENDING,
        expiresAt,
        score: input.candidate.score.total,
        scoreBreakdown: input.candidate.score as unknown as Prisma.InputJsonValue,
        routeEtaMinutes: input.candidate.routeEtaMinutes,
        distanceKm: input.candidate.distanceKm,
        vehicleMatchType: input.candidate.vehicleMatchType
      }
    });

    await this.logDecision({
      orderId: input.order.id,
      selectedDriverId: input.candidate.driverId,
      offerId: offer.id,
      assignmentMode: input.mode,
      routeEtaMinutes: input.candidate.routeEtaMinutes,
      vehicleMatchType: input.candidate.vehicleMatchType,
      totalScore: input.candidate.score.total,
        decisionPayload: {
          score: input.candidate.score,
          distanceKm: input.candidate.distanceKm,
          driverName: input.candidate.driverName,
          routeProvider: input.candidate.routeProvider
        },
        reason: 'Offer created'
      });

    await this.notificationsService.notifyDriver(input.candidate.driverId, 'trip_offer_new', {
      offerId: offer.id,
      orderId: input.order.id,
      routeEtaMinutes: input.candidate.routeEtaMinutes,
      vehicleMatchType: input.candidate.vehicleMatchType
    });

    this.realtimeService.emitDriverUpdate(input.candidate.driverId, 'trip:offer:new', {
      offerId: offer.id,
      orderId: input.order.id,
      expiresAt: expiresAt.toISOString(),
      routeEtaMinutes: input.candidate.routeEtaMinutes,
      vehicleMatchType: input.candidate.vehicleMatchType
    });

    await this.prisma.order.update({
      where: { id: input.order.id },
      data: {
        status: OrderStatus.MATCHING
      }
    });

    return offer;
  }

  private async createNextOffer(order: Order, excludedDriverIds: string[]) {
    const candidates = await this.buildCandidates(order);
    const eligibleCandidates = candidates.filter(
      (item) =>
        !excludedDriverIds.includes(item.driverId)
    );

    const onlineCandidate = eligibleCandidates.find(
      (item) => item.availabilityStatus === AvailabilityStatus.ONLINE
    );
    const busyFallbackCandidate = eligibleCandidates.find(
      (item) =>
        item.availabilityStatus === AvailabilityStatus.BUSY &&
        item.routeEtaMinutes <= this.busyFallbackMaxEtaMinutes &&
        item.distanceKm <= this.busyFallbackMaxDistanceKm &&
        !item.hasQueuedOrder &&
        (item.pendingOfferCount ?? 0) === 0
    );
    const candidate = onlineCandidate ?? busyFallbackCandidate;

    if (!candidate) {
      await this.logDecision({
        orderId: order.id,
        assignmentMode: 'NO_OFFER',
        decisionPayload: {
          excludedDrivers: excludedDriverIds.length,
          eligibleCandidates: eligibleCandidates.length,
          onlineCandidates: eligibleCandidates.filter(
            (entry) => entry.availabilityStatus === AvailabilityStatus.ONLINE
          ).length,
          busyFallbackCandidates: eligibleCandidates.filter(
            (entry) =>
              entry.availabilityStatus === AvailabilityStatus.BUSY &&
              entry.routeEtaMinutes <= this.busyFallbackMaxEtaMinutes &&
              entry.distanceKm <= this.busyFallbackMaxDistanceKm &&
              !entry.hasQueuedOrder &&
              (entry.pendingOfferCount ?? 0) === 0
          ).length
        },
        reason: 'No qualified online candidate and no queue-eligible busy fallback candidate'
      });
      return null;
    }

    return this.createOffer({
      order,
      candidate,
      mode:
        candidate.availabilityStatus === AvailabilityStatus.BUSY
          ? 'QUEUE_OFFER'
          : excludedDriverIds.length > 0
            ? 'REASSIGNMENT'
            : 'NEW_ASSIGNMENT'
    });
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

    const activeOffer = await this.prisma.tripOffer.findFirst({
      where: {
        orderId: order.id,
        status: TripOfferStatus.PENDING,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (activeOffer) {
      return {
        orderId: order.id,
        assigned: false,
        mode: 'OFFER_PENDING',
        offerId: activeOffer.id,
        routeEtaMinutes: activeOffer.routeEtaMinutes,
        vehicleMatchType: activeOffer.vehicleMatchType
      };
    }

    const historicalOffers = await this.prisma.tripOffer.findMany({
      where: { orderId: order.id },
      select: { driverId: true }
    });
    const triedDriverIds = [...new Set(historicalOffers.map((entry) => entry.driverId))];

    const offer = await this.createNextOffer(order, triedDriverIds);
    if (!offer) {
      return {
        orderId: order.id,
        assigned: false,
        reason: 'NO_DRIVERS_FOUND',
        mode: 'SEARCHING'
      };
    }

    return {
      orderId: order.id,
      assigned: false,
      mode: 'OFFER_SENT',
      offerId: offer.id,
      routeEtaMinutes: offer.routeEtaMinutes,
      vehicleMatchType: offer.vehicleMatchType
    };
  }

  private async expireOfferIfNeeded(offerId: string) {
    const offer = await this.prisma.tripOffer.findUnique({
      where: { id: offerId }
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    if (offer.status === TripOfferStatus.PENDING && offer.expiresAt.getTime() <= Date.now()) {
      return this.prisma.tripOffer.update({
        where: { id: offer.id },
        data: {
          status: TripOfferStatus.EXPIRED,
          respondedAt: new Date()
        }
      });
    }

    return offer;
  }

  async acceptOffer(offerId: string, driverId: string, driverPaymentMethodId?: string) {
    const existingOffer = await this.expireOfferIfNeeded(offerId);
    if (existingOffer.status !== TripOfferStatus.PENDING) {
      throw new NotFoundException('Offer is no longer active');
    }

    if (existingOffer.driverId !== driverId) {
      throw new NotFoundException('Offer does not belong to this driver');
    }

    const order = await this.prisma.order.findUnique({ where: { id: existingOffer.orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const activeTrip = await this.prisma.trip.findUnique({
      where: { orderId: order.id }
    });

    if (activeTrip) {
      await this.prisma.tripOffer.update({
        where: { id: existingOffer.id },
        data: {
          status: TripOfferStatus.CANCELLED,
          respondedAt: new Date()
        }
      });
      return {
        accepted: false,
        reason: 'ORDER_ALREADY_ASSIGNED',
        tripId: activeTrip.id
      };
    }

    const selectedPaymentMethod = await this.resolveDriverPreferredPaymentMethod(
      driverId,
      driverPaymentMethodId
    );

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.tripOffer.updateMany({
        where: {
          orderId: order.id,
          status: TripOfferStatus.PENDING,
          id: {
            not: existingOffer.id
          }
        },
        data: {
          status: TripOfferStatus.CANCELLED,
          respondedAt: new Date()
        }
      });

      const acceptedOffer = await tx.tripOffer.update({
        where: { id: existingOffer.id },
        data: {
          status: TripOfferStatus.ACCEPTED,
          respondedAt: new Date()
        }
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.ASSIGNED
        }
      });

      await tx.driverProfile.update({
        where: { id: driverId },
        data: {
          availabilityStatus: AvailabilityStatus.BUSY,
          idleSince: null
        }
      });

      const trip = await tx.trip.create({
        data: {
          orderId: order.id,
          driverId,
          etaMinutes: acceptedOffer.routeEtaMinutes,
          status: TripStatus.ASSIGNED,
          driverPreferredPaymentMethodId: selectedPaymentMethod.method?.id ?? null,
          driverPreferredUpiId:
            selectedPaymentMethod.method?.upiId ?? selectedPaymentMethod.payoutUpiId ?? null,
          driverPreferredPaymentLabel: selectedPaymentMethod.method?.label ?? null,
          driverPreferredUpiQrImageUrl:
            selectedPaymentMethod.method?.qrImageUrl ??
            selectedPaymentMethod.payoutUpiQrImageUrl ??
            null
        }
      });

      return {
        acceptedOffer,
        trip
      };
    });

    const hasCurrentTrip = await this.prisma.trip.count({
      where: {
        driverId,
        status: {
          in: [
            TripStatus.DRIVER_EN_ROUTE,
            TripStatus.ARRIVED_PICKUP,
            TripStatus.LOADING,
            TripStatus.IN_TRANSIT
          ]
        }
      }
    });

    await this.redis.set(
      buildTripStartOtpRedisKey(result.trip.id),
      generateTripStartOtpCode(),
      'EX',
      TRIP_START_OTP_TTL_SECONDS
    );

    if (hasCurrentTrip > 0) {
      await this.redis.set(`driver:${driverId}:next-order`, order.id, 'EX', 45 * 60);
    }

    await this.logDecision({
      orderId: order.id,
      selectedDriverId: driverId,
      offerId: existingOffer.id,
      assignmentMode: hasCurrentTrip > 0 ? 'QUEUE_ACCEPTED' : 'OFFER_ACCEPTED',
      routeEtaMinutes: existingOffer.routeEtaMinutes,
      vehicleMatchType: existingOffer.vehicleMatchType,
      totalScore: existingOffer.score,
      reason: 'Driver accepted offer'
    });

    await this.notificationsService.notifyCustomer(order.customerId, 'driver_assigned', {
      orderId: order.id,
      driverId,
      tripId: result.trip.id,
      etaMinutes: result.trip.etaMinutes
    });

    this.realtimeService.emitTripUpdate(order.id, 'trip:assigned', {
      tripId: result.trip.id,
      driverId,
      etaMinutes: result.trip.etaMinutes
    });

    this.realtimeService.emitDriverUpdate(driverId, 'trip:offer:accepted', {
      offerId: existingOffer.id,
      orderId: order.id,
      tripId: result.trip.id
    });

    return {
      accepted: true,
      tripId: result.trip.id,
      orderId: order.id,
      preferredPaymentMethodId: result.trip.driverPreferredPaymentMethodId,
      preferredUpiId: result.trip.driverPreferredUpiId
    };
  }

  private async resolveDriverPreferredPaymentMethod(
    driverId: string,
    requestedMethodId?: string
  ): Promise<{
    method?: {
      id: string;
      label?: string | null;
      upiId: string;
      qrImageUrl?: string | null;
    };
    payoutUpiId?: string | null;
    payoutUpiQrImageUrl?: string | null;
  }> {
    const driverProfile = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        userId: true,
        payoutAccount: {
          select: {
            upiId: true,
            upiQrImageUrl: true
          }
        }
      }
    });

    if (!driverProfile) {
      throw new NotFoundException('Driver profile not found');
    }

    const methods = await this.prisma.driverPaymentMethod.findMany({
      where: {
        userId: driverProfile.userId,
        isActive: true
      },
      orderBy: [{ isPreferred: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        label: true,
        upiId: true,
        qrImageUrl: true
      }
    });

    if (methods.length === 0) {
      if (requestedMethodId) {
        throw new BadRequestException('Selected payment method is not available for this driver');
      }

      return {
        payoutUpiId: driverProfile.payoutAccount?.upiId,
        payoutUpiQrImageUrl: driverProfile.payoutAccount?.upiQrImageUrl
      };
    }

    const selected = requestedMethodId
      ? methods.find((method) => method.id === requestedMethodId)
      : methods[0];

    if (!selected) {
      throw new BadRequestException('Selected payment method is not available for this driver');
    }

    return {
      method: selected,
      payoutUpiId: driverProfile.payoutAccount?.upiId,
      payoutUpiQrImageUrl: driverProfile.payoutAccount?.upiQrImageUrl
    };
  }

  async rejectOffer(offerId: string, driverId: string) {
    const existingOffer = await this.expireOfferIfNeeded(offerId);
    if (existingOffer.driverId !== driverId) {
      throw new NotFoundException('Offer does not belong to this driver');
    }

    if (existingOffer.status !== TripOfferStatus.PENDING) {
      return {
        rejected: false,
        reason: 'OFFER_NOT_PENDING'
      };
    }

    await this.prisma.tripOffer.update({
      where: { id: existingOffer.id },
      data: {
        status: TripOfferStatus.REJECTED,
        respondedAt: new Date()
      }
    });

    await this.logDecision({
      orderId: existingOffer.orderId,
      selectedDriverId: driverId,
      offerId: existingOffer.id,
      assignmentMode: 'OFFER_REJECTED',
      routeEtaMinutes: existingOffer.routeEtaMinutes,
      vehicleMatchType: existingOffer.vehicleMatchType,
      totalScore: existingOffer.score,
      reason: 'Driver rejected offer'
    });

    const order = await this.prisma.order.findUnique({
      where: { id: existingOffer.orderId }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const completedTrip = await this.prisma.trip.findUnique({
      where: { orderId: order.id }
    });

    if (completedTrip) {
      return {
        rejected: true,
        reoffered: false,
        reason: 'ALREADY_ASSIGNED'
      };
    }

    const previousOfferDrivers = await this.prisma.tripOffer.findMany({
      where: {
        orderId: order.id
      },
      select: {
        driverId: true
      }
    });

    const nextOffer = await this.createNextOffer(
      order,
      previousOfferDrivers.map((entry) => entry.driverId)
    );

    return {
      rejected: true,
      reoffered: Boolean(nextOffer),
      nextOfferId: nextOffer?.id
    };
  }

  async processExpiredOffers() {
    const expired = await this.prisma.tripOffer.findMany({
      where: {
        status: TripOfferStatus.PENDING,
        expiresAt: {
          lte: new Date()
        }
      },
      orderBy: { expiresAt: 'asc' },
      take: 200
    });

    if (expired.length === 0) {
      return {
        processed: 0,
        reoffered: 0
      };
    }

    const byOrder = new Map<string, string[]>();
    for (const offer of expired) {
      const existing = byOrder.get(offer.orderId) ?? [];
      existing.push(offer.id);
      byOrder.set(offer.orderId, existing);
    }

    let reoffered = 0;

    for (const [orderId, offerIds] of byOrder.entries()) {
      await this.prisma.tripOffer.updateMany({
        where: {
          id: {
            in: offerIds
          },
          status: TripOfferStatus.PENDING
        },
        data: {
          status: TripOfferStatus.EXPIRED,
          respondedAt: new Date()
        }
      });

      const order = await this.prisma.order.findUnique({
        where: { id: orderId }
      });

      if (
        !order ||
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.DELIVERED
      ) {
        continue;
      }

      const existingTrip = await this.prisma.trip.findUnique({
        where: { orderId: order.id }
      });

      if (existingTrip) {
        continue;
      }

      const usedDriverIds = await this.prisma.tripOffer.findMany({
        where: { orderId: order.id },
        select: {
          driverId: true
        }
      });

      const next = await this.createNextOffer(
        order,
        usedDriverIds.map((entry) => entry.driverId)
      );
      if (next) {
        reoffered += 1;
      }
    }

    return {
      processed: expired.length,
      reoffered
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
      include: { order: true }
    });

    if (!currentTrip) {
      throw new NotFoundException('Current trip not found');
    }

    const openOrders = await this.prisma.order.findMany({
      where: {
        status: {
          in: [OrderStatus.CREATED, OrderStatus.MATCHING]
        },
        id: {
          not: currentTrip.orderId
        }
      },
      take: 80,
      orderBy: { createdAt: 'asc' }
    });

    const candidates = openOrders
      .map((order) => {
        const matchType = this.vehicleMatchType(currentTrip.order.vehicleType, order.vehicleType);
        if (!matchType) {
          return null;
        }

        const dLat = order.pickupLat - currentTrip.order.dropLat;
        const dLng = order.pickupLng - currentTrip.order.dropLng;
        const distanceKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;

        return {
          order,
          matchType,
          distanceKm
        };
      })
      .filter(
        (
          value
        ): value is {
          order: Order;
          matchType: VehicleMatchType;
          distanceKm: number;
        } => Boolean(value)
      )
      .filter((entry) => entry.distanceKm <= 10)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const next = candidates[0];
    if (!next) {
      return {
        queued: false,
        reason: 'NO_QUALIFIED_ORDER'
      };
    }

    const offer = await this.prisma.tripOffer.create({
      data: {
        orderId: next.order.id,
        tripId: currentTrip.id,
        driverId,
        status: TripOfferStatus.PENDING,
        expiresAt: new Date(Date.now() + this.offerExpirySeconds * 1000),
        score: Number((1 / (next.distanceKm + 1)).toFixed(4)),
        routeEtaMinutes: Math.max(2, Math.round((next.distanceKm / 25) * 60)),
        distanceKm: Number(next.distanceKm.toFixed(2)),
        vehicleMatchType: next.matchType
      }
    });

    await this.notificationsService.notifyDriver(driverId, 'next_job_offer', {
      offerId: offer.id,
      orderId: next.order.id,
      distanceKm: offer.distanceKm
    });

    this.realtimeService.emitDriverUpdate(driverId, 'driver:queue-offer', {
      offerId: offer.id,
      orderId: next.order.id,
      expiresAt: offer.expiresAt.toISOString()
    });

    return {
      queued: false,
      offered: true,
      offerId: offer.id,
      orderId: next.order.id
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

    this.realtimeService.emitDriverUpdate(driverId, 'driver:queue-activated', {
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

  async getDriverPendingOffers(driverId: string) {
    const pending = await this.prisma.tripOffer.findMany({
      where: {
        driverId,
        status: TripOfferStatus.PENDING
      },
      include: {
        order: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return pending
      .filter((offer) => offer.expiresAt.getTime() > Date.now())
      .map((offer) => ({
        ...offer,
        estimatedDriverPayoutInr: this.estimateDriverPayoutInr(offer.order),
        currency: 'INR'
      }));
  }

  async getDispatchDecisions(orderId: string): Promise<DispatchDecision[]> {
    return this.prisma.dispatchDecision.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' }
    });
  }
}
