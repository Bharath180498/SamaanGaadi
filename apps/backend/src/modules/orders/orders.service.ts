import { Injectable, NotFoundException } from '@nestjs/common';
import { InsurancePlan, OrderStatus, VehicleType } from '@prisma/client';
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

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchService: DispatchService,
    private readonly pricingService: PricingService,
    private readonly ewayBillService: EwayBillService,
    private readonly driversService: DriversService,
    private readonly redisService: RedisService
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

  async estimate(payload: EstimateOrderDto) {
    const vehicleTypes: VehicleType[] = payload.vehicleType
      ? [payload.vehicleType]
      : [VehicleType.THREE_WHEELER, VehicleType.MINI_TRUCK, VehicleType.TRUCK];

    const distanceKm = this.computeDistanceKm(payload.pickup, payload.drop);
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
    const insurancePlan = payload.insuranceSelected ?? InsurancePlan.NONE;
    const distanceKm = this.computeDistanceKm(payload.pickup, payload.drop);
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
      estimated_price: Number(order.estimatedPrice),
      driver_assigned: assignment.assigned,
      dispatch_mode: assignment.mode ?? null,
      assignment
    };
  }

  list(query: OrdersQueryDto) {
    return this.prisma.order.findMany({
      where: {
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.status ? { status: query.status } : {})
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        trip: true,
        payment: true
      }
    });
  }

  async findById(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        trip: true,
        payment: true,
        customer: true
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async timeline(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        trip: true,
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
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
      return order;
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED
      }
    });
  }

  async attachEwayBill(orderId: string, payload: GenerateOrderEwayBillDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const generated = this.ewayBillService.generate(payload);

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        gstin: payload.gstin,
        invoiceValue: payload.invoiceValue,
        hsnCode: payload.hsnCode,
        ewayBillNumber: generated.ewayBillNumber
      }
    });
  }
}
