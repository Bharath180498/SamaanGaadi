import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AvailabilityStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  TripStatus
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { RateTripDto } from './dto/rate-trip.dto';
import { GenerateDeliveryProofUploadUrlDto } from './dto/generate-delivery-proof-upload-url.dto';
import { buildS3UploadUrl } from '../../common/utils/s3-upload.util';

@Injectable()
export class TripsService {
  private static readonly DELIVERY_PROOF_SIGNATURE_POINT_MIN = 6;

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

  private buildSafeFileName(fileName: string) {
    const trimmed = fileName.trim();
    if (!trimmed) {
      return `delivery-proof-${Date.now()}.jpg`;
    }

    const normalized = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
    return normalized.slice(-120) || `delivery-proof-${Date.now()}.jpg`;
  }

  private parseReceiverSignature(rawPayload: string) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      throw new BadRequestException('Receiver signature is invalid JSON');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException('Receiver signature payload is missing');
    }

    const signature = parsed as {
      width?: unknown;
      height?: unknown;
      capturedAt?: unknown;
      strokes?: unknown;
    };

    const width = Number(signature.width);
    const height = Number(signature.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new BadRequestException('Receiver signature canvas dimensions are invalid');
    }

    if (!Array.isArray(signature.strokes) || signature.strokes.length === 0) {
      throw new BadRequestException('Receiver signature is required');
    }

    let totalPoints = 0;
    const normalizedStrokes = signature.strokes
      .map((stroke) => {
        if (!Array.isArray(stroke)) {
          return [] as Array<{ x: number; y: number }>;
        }

        const points = stroke
          .map((point) => {
            if (!point || typeof point !== 'object') {
              return null;
            }

            const candidate = point as { x?: unknown; y?: unknown };
            const x = Number(candidate.x);
            const y = Number(candidate.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              return null;
            }

            return {
              x: Number(x.toFixed(2)),
              y: Number(y.toFixed(2))
            };
          })
          .filter((point): point is { x: number; y: number } => point !== null);

        totalPoints += points.length;
        return points;
      })
      .filter((stroke) => stroke.length > 1);

    if (
      normalizedStrokes.length === 0 ||
      totalPoints < TripsService.DELIVERY_PROOF_SIGNATURE_POINT_MIN
    ) {
      throw new BadRequestException('Receiver signature is too short');
    }

    let signatureCapturedAt: Date | undefined;
    if (typeof signature.capturedAt === 'string' && signature.capturedAt.trim()) {
      const parsedDate = new Date(signature.capturedAt);
      if (!Number.isNaN(parsedDate.getTime())) {
        signatureCapturedAt = parsedDate;
      }
    }

    const signatureJson = {
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
      capturedAt: signatureCapturedAt?.toISOString() ?? new Date().toISOString(),
      strokes: normalizedStrokes
    } satisfies Prisma.InputJsonValue;

    return {
      signatureJson,
      signatureCapturedAt
    };
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
        rating: true,
        deliveryProof: true
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

  async generateDeliveryProofUploadUrl(
    tripId: string,
    payload: GenerateDeliveryProofUploadUrlDto
  ) {
    const trip = await this.getTrip(tripId);
    this.assertDriver(trip.driverId, payload.driverId);

    if (trip.status !== TripStatus.IN_TRANSIT) {
      throw new BadRequestException('Delivery proof can only be added while trip is in transit');
    }

    const normalizedContentType = payload.contentType.trim().toLowerCase();
    if (!normalizedContentType.startsWith('image/')) {
      throw new BadRequestException('Delivery proof photo must be an image');
    }

    const safeFileName = this.buildSafeFileName(payload.fileName);
    const fileKey = `delivery-proofs/${tripId}/photo-${Date.now()}-${safeFileName}`;
    const endpoint = (this.configService.get<string>('s3.endpoint') ?? '').trim();
    const accessKeyId = (this.configService.get<string>('s3.accessKeyId') ?? '').trim();
    const secretAccessKey = (this.configService.get<string>('s3.secretAccessKey') ?? '').trim();
    const bucket = (this.configService.get<string>('s3.bucket') ?? '').trim();
    const region = this.configService.get<string>('s3.region') ?? 'auto';
    const signedUpload = await buildS3UploadUrl(
      {
        endpoint,
        region,
        bucket,
        accessKeyId,
        secretAccessKey
      },
      {
        fileKey,
        contentType: normalizedContentType
      }
    );

    if (!signedUpload) {
      return {
        fileKey,
        uploadUrl: `mock://upload/${fileKey}`,
        fileUrl: `https://mock-storage.local/${fileKey}`,
        contentType: normalizedContentType,
        mode: 'mock-storage'
      };
    }

    return {
      fileKey,
      uploadUrl: signedUpload.uploadUrl,
      fileUrl: signedUpload.fileUrl,
      contentType: normalizedContentType,
      mode: signedUpload.mode
    };
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

    if (trip.status !== TripStatus.IN_TRANSIT) {
      throw new BadRequestException('Trip must be in transit before completion');
    }

    const payment = await this.prisma.payment.findUnique({
      where: {
        orderId: trip.orderId
      }
    });

    if (
      payment?.provider === PaymentProvider.UPI &&
      payment.directPayToDriver &&
      payment.status !== PaymentStatus.CAPTURED
    ) {
      throw new BadRequestException(
        'Direct UPI payment is still pending. Ask customer to complete payment before marking trip delivered.'
      );
    }

    if (
      payment &&
      payment.provider !== PaymentProvider.WALLET &&
      payment.status !== PaymentStatus.CAPTURED
    ) {
      throw new BadRequestException(
        'Payment is still pending. Ask customer to complete payment before marking trip delivered.'
      );
    }

    const receiverName = payload.receiverName.trim();
    if (receiverName.length < 2) {
      throw new BadRequestException('Receiver name is required for delivery proof');
    }

    const deliveryPhotoFileKey = payload.deliveryPhotoFileKey.trim();
    const deliveryPhotoUrl = payload.deliveryPhotoUrl.trim();
    if (!deliveryPhotoFileKey || !deliveryPhotoUrl) {
      throw new BadRequestException('Delivery photo is required before completing trip');
    }

    const { signatureJson, signatureCapturedAt } = this.parseReceiverSignature(
      payload.receiverSignature
    );

    const completed = await this.prisma.$transaction(async (tx) => {
      const deliveryProof = await tx.tripDeliveryProof.upsert({
        where: { tripId: trip.id },
        update: {
          driverId,
          receiverName,
          receiverSignature: signatureJson,
          signatureCapturedAt,
          photoFileKey: deliveryPhotoFileKey,
          photoUrl: deliveryPhotoUrl,
          photoMimeType: payload.deliveryPhotoMimeType?.trim() || 'image/jpeg'
        },
        create: {
          tripId: trip.id,
          driverId,
          receiverName,
          receiverSignature: signatureJson,
          signatureCapturedAt,
          photoFileKey: deliveryPhotoFileKey,
          photoUrl: deliveryPhotoUrl,
          photoMimeType: payload.deliveryPhotoMimeType?.trim() || 'image/jpeg'
        }
      });

      const updatedTrip = await tx.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.COMPLETED,
          deliveryTime: new Date(),
          distanceKm: payload.distanceKm,
          durationMinutes: payload.durationMinutes
        }
      });

      const finalFare = Number(
        (Number(trip.order.estimatedPrice) + Number(updatedTrip.waitingCharge)).toFixed(2)
      );

      await tx.order.update({
        where: { id: trip.orderId },
        data: {
          status: OrderStatus.DELIVERED,
          finalPrice: finalFare
        }
      });

      const existingPayment = await tx.payment.findUnique({
        where: {
          orderId: trip.orderId
        }
      });

      if (!existingPayment) {
        await tx.payment.create({
          data: {
            orderId: trip.orderId,
            provider: PaymentProvider.WALLET,
            amount: finalFare,
            status: PaymentStatus.CAPTURED,
            providerRef: `driver_collected_${Date.now()}`
          }
        });
      } else {
        const paymentUpdate: Prisma.PaymentUpdateInput = {
          amount: finalFare
        };

        if (existingPayment.provider === PaymentProvider.WALLET) {
          paymentUpdate.status = PaymentStatus.CAPTURED;
          if (!existingPayment.providerRef) {
            paymentUpdate.providerRef = `driver_collected_${Date.now()}`;
          }
        }

        await tx.payment.update({
          where: { id: existingPayment.id },
          data: paymentUpdate
        });
      }

      await tx.driverProfile.update({
        where: { id: driverId },
        data: {
          availabilityStatus: AvailabilityStatus.ONLINE,
          idleSince: new Date()
        }
      });

      return {
        trip: updatedTrip,
        deliveryProof
      };
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
      tripId,
      receiverName,
      deliveryPhotoUrl,
      signatureCapturedAt: signatureCapturedAt?.toISOString() ?? null,
      deliveryProofCaptured: true
    });

    await this.notificationsService.notifyDriver(driverId, 'trip_completed', {
      orderId: trip.orderId,
      tripId,
      nextJobActivated: activation.activated
    });

    this.realtimeService.emitTripUpdate(trip.orderId, 'trip:completed', {
      tripId,
      driverId,
      nextJobActivated: activation.activated,
      deliveryProofCaptured: true,
      receiverName,
      deliveryPhotoUrl,
      signatureCapturedAt: signatureCapturedAt?.toISOString() ?? null
    });

    return {
      ...completed.trip,
      deliveryProof: completed.deliveryProof,
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
