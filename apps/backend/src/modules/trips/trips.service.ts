import { Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityStatus, OrderStatus, TripStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { RateTripDto } from './dto/rate-trip.dto';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeService: RealtimeService,
    private readonly dispatchService: DispatchService
  ) {}

  private get waitingRate() {
    return this.configService.get<number>('waitingRatePerMinute') ?? 3;
  }

  async findById(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        order: true,
        driver: {
          include: {
            user: true
          }
        },
        rating: true
      }
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    return trip;
  }

  private async getTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        order: true,
        driver: true
      }
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    return trip;
  }

  private assertDriver(tripDriverId: string, requestedDriverId: string) {
    if (tripDriverId !== requestedDriverId) {
      throw new NotFoundException('Driver not assigned to this trip');
    }
  }

  async accept(tripId: string, driverId: string) {
    const trip = await this.getTrip(tripId);
    this.assertDriver(trip.driverId, driverId);

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: TripStatus.DRIVER_EN_ROUTE
      }
    });

    await this.notificationsService.notifyCustomer(trip.order.customerId, 'driver_en_route', {
      orderId: trip.orderId,
      driverId,
      tripId
    });

    this.realtimeService.emitTripUpdate(trip.orderId, 'trip:driver-en-route', {
      tripId,
      driverId
    });

    return updated;
  }

  async arrivedPickup(tripId: string, driverId: string) {
    const trip = await this.getTrip(tripId);
    this.assertDriver(trip.driverId, driverId);

    const [updatedTrip] = await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.ARRIVED_PICKUP,
          pickupTime: trip.pickupTime ?? new Date()
        }
      }),
      this.prisma.order.update({
        where: { id: trip.orderId },
        data: {
          status: OrderStatus.AT_PICKUP
        }
      })
    ]);

    await this.notificationsService.notifyCustomer(trip.order.customerId, 'driver_arrived_pickup', {
      orderId: trip.orderId,
      tripId
    });

    this.realtimeService.emitTripUpdate(trip.orderId, 'trip:arrived-pickup', {
      tripId,
      driverId
    });

    return updatedTrip;
  }

  async startLoading(tripId: string, driverId: string) {
    const trip = await this.getTrip(tripId);
    this.assertDriver(trip.driverId, driverId);

    const [updatedTrip] = await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.LOADING,
          loadingStart: new Date()
        }
      }),
      this.prisma.order.update({
        where: { id: trip.orderId },
        data: {
          status: OrderStatus.LOADING
        }
      })
    ]);

    this.realtimeService.emitTripUpdate(trip.orderId, 'trip:loading-started', {
      tripId,
      driverId
    });

    return updatedTrip;
  }

  private calculateWaitingCharge(loadingStart?: Date | null) {
    if (!loadingStart) {
      return {
        waitingMinutes: 0,
        charge: 0
      };
    }

    const loadingMinutes = Math.max(0, Math.round((Date.now() - loadingStart.getTime()) / (60 * 1000)));
    const extraMinutes = Math.max(0, loadingMinutes - 20);

    return {
      waitingMinutes: extraMinutes,
      charge: Number((extraMinutes * this.waitingRate).toFixed(2))
    };
  }

  async startTransit(tripId: string, driverId: string) {
    const trip = await this.getTrip(tripId);
    this.assertDriver(trip.driverId, driverId);

    const waiting = this.calculateWaitingCharge(trip.loadingStart);

    const [updatedTrip] = await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.IN_TRANSIT,
          loadingEnd: new Date(),
          waitingCharge: waiting.charge
        }
      }),
      this.prisma.order.update({
        where: { id: trip.orderId },
        data: {
          status: OrderStatus.IN_TRANSIT,
          waitingCharge: waiting.charge
        }
      })
    ]);

    if (waiting.charge > 0) {
      await this.notificationsService.notifyCustomer(trip.order.customerId, 'waiting_charge_triggered', {
        orderId: trip.orderId,
        waitingMinutes: waiting.waitingMinutes,
        waitingCharge: waiting.charge
      });

      await this.notificationsService.notifyDriver(driverId, 'waiting_charge_triggered', {
        orderId: trip.orderId,
        waitingMinutes: waiting.waitingMinutes,
        waitingCharge: waiting.charge
      });
    }

    const queue = await this.dispatchService.queueNextJobForDriver(driverId, tripId);

    this.realtimeService.emitTripUpdate(trip.orderId, 'trip:in-transit', {
      tripId,
      driverId,
      waitingCharge: waiting.charge,
      nextJobQueued: queue.queued
    });

    return {
      ...updatedTrip,
      queue
    };
  }

  async complete(tripId: string, driverId: string, payload: CompleteTripDto) {
    const trip = await this.getTrip(tripId);
    this.assertDriver(trip.driverId, driverId);

    const completed = await this.prisma.$transaction(async (tx) => {
      const updatedTrip = await tx.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.COMPLETED,
          deliveryTime: new Date(),
          distanceKm: payload.distanceKm,
          durationMinutes: payload.durationMinutes
        }
      });

      await tx.order.update({
        where: { id: trip.orderId },
        data: {
          status: OrderStatus.DELIVERED,
          finalPrice: Number(trip.order.estimatedPrice) + Number(updatedTrip.waitingCharge)
        }
      });

      await tx.driverProfile.update({
        where: { id: driverId },
        data: {
          availabilityStatus: AvailabilityStatus.ONLINE,
          idleSince: new Date()
        }
      });

      return updatedTrip;
    });

    const activation = await this.dispatchService.activateQueuedJob(driverId);

    if (activation.activated) {
      await this.prisma.driverProfile.update({
        where: { id: driverId },
        data: {
          availabilityStatus: AvailabilityStatus.BUSY,
          idleSince: null
        }
      });
    }

    await this.notificationsService.notifyCustomer(trip.order.customerId, 'delivery_completed', {
      orderId: trip.orderId,
      tripId
    });

    await this.notificationsService.notifyDriver(driverId, 'trip_completed', {
      orderId: trip.orderId,
      tripId,
      nextJobActivated: activation.activated
    });

    this.realtimeService.emitTripUpdate(trip.orderId, 'trip:completed', {
      tripId,
      driverId,
      nextJobActivated: activation.activated
    });

    return {
      ...completed,
      nextJob: activation
    };
  }

  async rate(tripId: string, payload: RateTripDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: true }
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const rating = await this.prisma.rating.upsert({
      where: { tripId },
      update: {
        driverRating: payload.driverRating,
        customerRating: payload.customerRating,
        review: payload.review
      },
      create: {
        tripId,
        driverRating: payload.driverRating,
        customerRating: payload.customerRating,
        review: payload.review
      }
    });

    const driverRatings = await this.prisma.rating.findMany({
      where: {
        trip: {
          driverId: trip.driverId
        }
      }
    });

    const averageRating =
      driverRatings.reduce((sum, current) => sum + current.driverRating, 0) / driverRatings.length;

    await this.prisma.user.update({
      where: { id: trip.driver.userId },
      data: {
        rating: Number(averageRating.toFixed(2))
      }
    });

    return rating;
  }

  async sos(tripId: string, driverId: string) {
    const trip = await this.getTrip(tripId);
    this.assertDriver(trip.driverId, driverId);

    await this.notificationsService.notifyCustomer(trip.order.customerId, 'sos_triggered', {
      tripId,
      orderId: trip.orderId,
      driverId
    });

    await this.notificationsService.notifyDriver(driverId, 'sos_triggered', {
      tripId,
      orderId: trip.orderId
    });

    this.realtimeService.emitTripUpdate(trip.orderId, 'trip:sos', {
      tripId,
      orderId: trip.orderId,
      driverId,
      triggeredAt: new Date().toISOString()
    });

    return {
      success: true,
      tripId,
      orderId: trip.orderId,
      triggeredAt: new Date().toISOString()
    };
  }
}
