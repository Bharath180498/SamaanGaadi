import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AvailabilityStatus,
  InsurancePlan,
  OrderStatus,
  TripOfferStatus,
  TripStatus,
  VehicleType
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { DispatchService } from '../dispatch/dispatch.service';
import { PricingService } from '../pricing/pricing.service';
import { EwayBillService } from '../ewaybill/ewaybill.service';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { GenerateOrderEwayBillDto } from './dto/generate-order-ewaybill.dto';
import { EstimateOrderDto } from './dto/estimate-order.dto';
import { DriversService } from '../drivers/drivers.service';
import { RedisService } from '../../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { buildS3DownloadUrl } from '../../common/utils/s3-upload.util';

const MAX_INTRA_CITY_DISTANCE_KM = 35;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly dispatchService: DispatchService,
    private readonly pricingService: PricingService,
    private readonly ewayBillService: EwayBillService,
    private readonly driversService: DriversService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeService: RealtimeService
  ) {}

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

  private assertIntraCityDistance(distanceKm: number) {
    if (distanceKm > MAX_INTRA_CITY_DISTANCE_KM) {
      throw new BadRequestException(
        'City-to-city deliveries are coming soon. Please choose pickup and drop within city limits.'
      );
    }
  }

  private async attachReadableDeliveryProofUrl<
    T extends {
      trip?: {
        deliveryProof?: {
          photoFileKey?: string | null;
          photoUrl?: string | null;
        } | null;
      } | null;
    }
  >(order: T): Promise<T> {
    const proof = order.trip?.deliveryProof;
    if (!proof || typeof proof.photoFileKey !== 'string' || !proof.photoFileKey.trim()) {
      return order;
    }

    const endpoint = (this.configService.get<string>('s3.endpoint') ?? '').trim();
    const accessKeyId = (this.configService.get<string>('s3.accessKeyId') ?? '').trim();
    const secretAccessKey = (this.configService.get<string>('s3.secretAccessKey') ?? '').trim();
    const bucket = (this.configService.get<string>('s3.bucket') ?? '').trim();
    const region = this.configService.get<string>('s3.region') ?? 'auto';

    const signedReadUrl = await buildS3DownloadUrl(
      {
        endpoint,
        region,
        bucket,
        accessKeyId,
        secretAccessKey
      },
      {
        fileKey: proof.photoFileKey,
        expiresInSeconds: 3600
      }
    );

    if (signedReadUrl) {
      proof.photoUrl = signedReadUrl;
    }

    return order;
  }

  async estimate(payload: EstimateOrderDto) {
    const vehicleTypes: VehicleType[] = payload.vehicleType
      ? [payload.vehicleType]
      : [VehicleType.THREE_WHEELER, VehicleType.MINI_TRUCK, VehicleType.TRUCK];

    const distanceKm = this.computeDistanceKm(payload.pickup, payload.drop);
    this.assertIntraCityDistance(distanceKm);
    const insuranceSelected = payload.insuranceSelected ?? InsurancePlan.NONE;
    const goodsValue = payload.goodsValue ?? 10000;

    const options = await Promise.all(
      vehicleTypes.map(async (vehicleType) => {
        const nearby = await this.driversService.findNearby({
          lat: payload.pickup.lat,
          lng: payload.pickup.lng,
          radiusKm: 10,
          vehicleType,
          minRating: payload.minDriverRating
        });

        const topDriver = nearby
          .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
          .at(0);

        const estimate = await this.pricingService.estimatePrice({
          vehicleType,
          distanceKm,
          insurancePlan: insuranceSelected,
          goodsValue,
          driverRating: topDriver?.user?.rating
        });

        const etaMinutes = topDriver ? Math.max(5, Math.round((topDriver.distanceKm / 25) * 60)) : 15;

        return {
          vehicleType,
          distanceKm: Number(distanceKm.toFixed(2)),
          etaMinutes,
          availableDrivers: nearby.length,
          topDriver: topDriver
            ? {
                driverId: topDriver.id,
                rating: topDriver.user.rating,
                distanceKm: Number((topDriver.distanceKm ?? 0).toFixed(2))
              }
            : null,
          pricing: estimate
        };
      })
    );

    return {
      pickup: payload.pickup,
      drop: payload.drop,
      insuranceSelected,
      goodsValue,
      minDriverRating: payload.minDriverRating ?? null,
      options: options.sort((a, b) => a.pricing.total - b.pricing.total)
    };
  }

  async create(payload: CreateOrderDto) {
    const activeOrders = await this.prisma.order.findMany({
      where: {
        customerId: payload.customerId,
        status: {
          in: [
            OrderStatus.CREATED,
            OrderStatus.MATCHING,
            OrderStatus.ASSIGNED,
            OrderStatus.AT_PICKUP,
            OrderStatus.LOADING,
            OrderStatus.IN_TRANSIT
          ]
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 4
    });

    if (activeOrders.length >= 3) {
      throw new BadRequestException('Maximum 3 active bookings allowed per customer');
    }

    const insurancePlan = payload.insuranceSelected ?? InsurancePlan.NONE;
    const distanceKm = this.computeDistanceKm(payload.pickup, payload.drop);
    this.assertIntraCityDistance(distanceKm);
    const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
    const isScheduledFuture = Boolean(
      scheduledAt && scheduledAt.getTime() > Date.now() + 5 * 60 * 1000
    );

    const estimate = await this.pricingService.estimatePrice({
      vehicleType: payload.vehicleType,
      distanceKm,
      insurancePlan,
      goodsValue: payload.goodsValue
    });

    const order = await this.prisma.order.create({
      data: {
        customerId: payload.customerId,
        pickupAddress: payload.pickup.address,
        pickupLat: payload.pickup.lat,
        pickupLng: payload.pickup.lng,
        dropAddress: payload.drop.address,
        dropLat: payload.drop.lat,
        dropLng: payload.drop.lng,
        scheduledAt,
        vehicleType: payload.vehicleType,
        goodsDescription: payload.goodsDescription,
        goodsType: payload.goodsType,
        goodsValue: payload.goodsValue,
        insuranceSelected: insurancePlan,
        insurancePremium: estimate.insuranceCharge,
        estimatedPrice: estimate.total,
        status: isScheduledFuture ? OrderStatus.CREATED : OrderStatus.MATCHING,
        gstin: payload.gstin,
        hsnCode: payload.hsnCode,
        invoiceValue: payload.invoiceValue
      }
    });

    const assignment = isScheduledFuture
      ? {
          assigned: false,
          mode: 'SCHEDULED',
          reason: 'WILL_DISPATCH_AT_SCHEDULED_TIME'
        }
      : await this.dispatchService.assignOrder(order.id);

    return {
      order_id: order.id,
      order_status: order.status,
      estimated_price: Number(order.estimatedPrice),
      driver_assigned: assignment.assigned,
      dispatch_mode: assignment.mode ?? null,
      assignment
    };
  }

  async list(query: OrdersQueryDto) {
    const orders = await this.prisma.order.findMany({
      where: {
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.status ? { status: query.status } : {})
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        trip: {
          include: {
            deliveryProof: {
              select: {
                id: true,
                receiverName: true,
                photoFileKey: true,
                photoUrl: true,
                createdAt: true
              }
            }
          }
        },
        payment: true
      }
    });

    return Promise.all(orders.map((order) => this.attachReadableDeliveryProofUrl(order)));
  }

  async findById(orderId: string) {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true
      }
    });

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    if (existing.status === OrderStatus.MATCHING) {
      await this.dispatchService.assignOrder(orderId);
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        trip: {
          include: {
            driver: {
              include: {
                user: true,
                vehicles: true,
                payoutAccount: true,
                paymentMethods: {
                  where: { isActive: true },
                  orderBy: [{ isPreferred: 'desc' }, { updatedAt: 'desc' }]
                },
                _count: {
                  select: {
                    trips: true
                  }
                }
              }
            },
            queuedDriver: {
              include: {
                user: true
              }
            },
            rating: true,
            deliveryProof: true
          }
        },
        payment: true,
        customer: true
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.attachReadableDeliveryProofUrl(order);
  }

  async timeline(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        trip: {
          include: {
            deliveryProof: {
              select: {
                createdAt: true
              }
            }
          }
        },
        payment: true
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const timeline = [
      {
        key: 'ORDER_CREATED',
        status: 'CREATED',
        timestamp: order.createdAt
      },
      {
        key: 'ORDER_STATUS',
        status: order.status,
        timestamp: order.updatedAt
      }
    ];

    if (order.trip) {
      if (order.trip.pickupTime) {
        timeline.push({
          key: 'PICKUP_TIME',
          status: 'AT_PICKUP',
          timestamp: order.trip.pickupTime
        });
      }

      if (order.trip.loadingStart) {
        timeline.push({
          key: 'LOADING_STARTED',
          status: 'LOADING',
          timestamp: order.trip.loadingStart
        });
      }

      if (order.trip.loadingEnd) {
        timeline.push({
          key: 'TRANSIT_STARTED',
          status: 'IN_TRANSIT',
          timestamp: order.trip.loadingEnd
        });
      }

      if (order.trip.deliveryTime) {
        timeline.push({
          key: 'DELIVERED',
          status: 'DELIVERED',
          timestamp: order.trip.deliveryTime
        });
      }

      if (order.trip.deliveryProof?.createdAt) {
        timeline.push({
          key: 'DELIVERY_PROOF_CAPTURED',
          status: 'DELIVERY_PROOF_CAPTURED',
          timestamp: order.trip.deliveryProof.createdAt
        });
      }
    }

    if (order.payment) {
      timeline.push({
        key: 'PAYMENT',
        status: order.payment.status,
        timestamp: order.payment.updatedAt
      });
    }

    return {
      orderId: order.id,
      status: order.status,
      timeline: timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    };
  }

  async locationHistory(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const history = await this.redis.lrange(`order:${orderId}:locations`, 0, 199);

    return {
      orderId,
      points: history
        .map((entry) => {
          try {
            return JSON.parse(entry);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    };
  }

  async cancel(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        trip: true
      }
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
      return order;
    }

    const cancellableStatuses: OrderStatus[] = [
      OrderStatus.CREATED,
      OrderStatus.MATCHING,
      OrderStatus.ASSIGNED
    ];
    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException(
        'Booking can be cancelled only before driver assignment, or within 1 minute after assignment.'
      );
    }

    if (order.status === OrderStatus.ASSIGNED) {
      if (!order.trip) {
        throw new BadRequestException('Booking assignment details are unavailable. Please refresh and retry.');
      }

      if (order.trip.status !== TripStatus.ASSIGNED) {
        throw new BadRequestException('Driver has already started the trip. Cancellation is no longer allowed.');
      }

      const matchedAtMs = order.trip.createdAt.getTime();
      const elapsedSinceMatchMs = Date.now() - matchedAtMs;
      if (elapsedSinceMatchMs > 60 * 1000) {
        throw new BadRequestException(
          'Cancellation window expired. You can cancel only within 1 minute after driver assignment.'
        );
      }
    }

    const cancelledAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.tripOffer.updateMany({
        where: {
          orderId,
          status: TripOfferStatus.PENDING
        },
        data: {
          status: TripOfferStatus.CANCELLED,
          respondedAt: cancelledAt
        }
      });

      if (order.trip) {
        await tx.trip.update({
          where: { id: order.trip.id },
          data: {
            status: TripStatus.CANCELLED
          }
        });
      }

      const cancelledOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED
        }
      });

      if (order.trip) {
        const hasOtherActiveTrips = await tx.trip.count({
          where: {
            driverId: order.trip.driverId,
            id: { not: order.trip.id },
            status: {
              in: [
                TripStatus.ASSIGNED,
                TripStatus.DRIVER_EN_ROUTE,
                TripStatus.ARRIVED_PICKUP,
                TripStatus.LOADING,
                TripStatus.IN_TRANSIT
              ]
            }
          }
        });

        if (hasOtherActiveTrips === 0) {
          await tx.driverProfile.update({
            where: { id: order.trip.driverId },
            data: {
              availabilityStatus: AvailabilityStatus.ONLINE,
              idleSince: cancelledAt
            }
          });
        }
      }

      return cancelledOrder;
    });

    this.realtimeService.emitTripUpdate(order.id, 'trip:cancelled', {
      orderId: order.id,
      status: 'CANCELLED'
    });

    if (order.trip) {
      this.realtimeService.emitDriverUpdate(order.trip.driverId, 'trip:customer-cancelled', {
        orderId: order.id,
        tripId: order.trip.id,
        status: 'CANCELLED'
      });

      // Push delivery must not block cancellation response.
      void this.notificationsService
        .notifyDriver(order.trip.driverId, 'trip_cancelled_by_customer', {
          orderId: order.id,
          tripId: order.trip.id
        })
        .catch(() => undefined);
    }

    return result;
  }

  async attachEwayBill(orderId: string, payload: GenerateOrderEwayBillDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const generated = await this.ewayBillService.generate(payload);
    const ewayBillNumber =
      typeof (generated as { ewayBillNumber?: unknown }).ewayBillNumber === 'string'
        ? (generated as { ewayBillNumber: string }).ewayBillNumber
        : undefined;

    if (!ewayBillNumber) {
      throw new NotFoundException('E-way bill provider did not return a bill number');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        gstin: payload.gstin,
        invoiceValue: payload.invoiceValue,
        hsnCode: payload.hsnCode,
        ewayBillNumber
      }
    });
  }
}
