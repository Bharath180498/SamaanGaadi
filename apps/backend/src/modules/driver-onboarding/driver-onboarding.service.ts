import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  DriverPaymentMethodType,
  OnboardingStatus,
  Prisma,
  VerificationStatus
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertDriverProfileDto } from './dto/upsert-profile.dto';
import { UpsertDriverVehicleDto } from './dto/upsert-vehicle.dto';
import { UpsertDriverBankDto } from './dto/upsert-bank.dto';
import { GeneratePaymentUploadUrlDto } from './dto/generate-payment-upload-url.dto';
import { CreateDriverPaymentMethodDto } from './dto/create-driver-payment-method.dto';
import { buildS3UploadUrl } from '../../common/utils/s3-upload.util';

@Injectable()
export class DriverOnboardingService {
  private static readonly UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/i;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  private normalizeUpiId(upiId: string) {
    return upiId.trim().toLowerCase();
  }

  private isValidUpiId(upiId: string) {
    return DriverOnboardingService.UPI_REGEX.test(upiId);
  }

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { onboarding: true, driverProfile: true }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async ensureOnboarding(userId: string) {
    const user = await this.ensureUser(userId);
    if (user.onboarding) {
      return user.onboarding;
    }

    return this.prisma.driverOnboarding.create({
      data: {
        userId,
        fullName: user.name,
        phone: user.phone,
        email: user.email,
        status: OnboardingStatus.IN_PROGRESS
      }
    });
  }

  private async findDriverProfile(userId: string) {
    return this.prisma.driverProfile.findUnique({
      where: { userId },
      select: { id: true }
    });
  }

  private async syncMethodsToDriverProfile(userId: string, driverProfileId: string) {
    await this.prisma.driverPaymentMethod.updateMany({
      where: {
        userId,
        isActive: true,
        OR: [{ driverId: null }, { driverId: { not: driverProfileId } }]
      },
      data: {
        driverId: driverProfileId
      }
    });
  }

  private async ensureDefaultPaymentMethod(userId: string, upiId: string, qrImageUrl?: string | null) {
    const normalizedUpiId = this.normalizeUpiId(upiId);

    const existingMethods = await this.prisma.driverPaymentMethod.findMany({
      where: { userId, isActive: true },
      orderBy: [{ isPreferred: 'desc' }, { updatedAt: 'desc' }]
    });

    const existing = existingMethods.find((method) => method.upiId === normalizedUpiId);
    if (existing) {
      if (qrImageUrl && !existing.qrImageUrl) {
        await this.prisma.driverPaymentMethod.update({
          where: { id: existing.id },
          data: {
            qrImageUrl,
            type: DriverPaymentMethodType.UPI_QR
          }
        });
      }
      return;
    }

    const driverProfile = await this.findDriverProfile(userId);
    const shouldPrefer = existingMethods.length === 0;

    if (shouldPrefer) {
      await this.prisma.driverPaymentMethod.updateMany({
        where: { userId, isActive: true },
        data: { isPreferred: false }
      });
    }

    await this.prisma.driverPaymentMethod.create({
      data: {
        userId,
        driverId: driverProfile?.id,
        type: qrImageUrl ? DriverPaymentMethodType.UPI_QR : DriverPaymentMethodType.UPI_VPA,
        label: shouldPrefer ? 'Primary UPI' : qrImageUrl ? 'UPI QR' : 'UPI',
        upiId: normalizedUpiId,
        qrImageUrl: qrImageUrl ?? undefined,
        isPreferred: shouldPrefer
      }
    });
  }

  private async syncPreferredMethodToPayoutAccount(userId: string) {
    const [driverProfile, preferredMethod] = await Promise.all([
      this.findDriverProfile(userId),
      this.prisma.driverPaymentMethod.findFirst({
        where: {
          userId,
          isActive: true,
          isPreferred: true
        },
        orderBy: { updatedAt: 'desc' }
      })
    ]);

    if (!driverProfile || !preferredMethod) {
      return;
    }

    await this.prisma.driverPayoutAccount.updateMany({
      where: { driverId: driverProfile.id },
      data: {
        upiId: preferredMethod.upiId,
        upiQrImageUrl: preferredMethod.qrImageUrl ?? null
      }
    });
  }

  async listPaymentMethods(userId: string) {
    const user = await this.ensureUser(userId);

    if (user.driverProfile?.id) {
      await this.syncMethodsToDriverProfile(userId, user.driverProfile.id);
    }

    return this.prisma.driverPaymentMethod.findMany({
      where: {
        userId,
        isActive: true
      },
      orderBy: [{ isPreferred: 'desc' }, { updatedAt: 'desc' }]
    });
  }

  async generatePaymentMethodUploadUrl(payload: GeneratePaymentUploadUrlDto) {
    await this.ensureUser(payload.userId);

    const endpoint = (this.configService.get<string>('s3.endpoint') ?? '').trim();
    const accessKeyId = (this.configService.get<string>('s3.accessKeyId') ?? '').trim();
    const secretAccessKey = (this.configService.get<string>('s3.secretAccessKey') ?? '').trim();
    const bucket = (this.configService.get<string>('s3.bucket') ?? '').trim();
    const region = this.configService.get<string>('s3.region') ?? 'auto';
    const contentType = payload.contentType?.trim() || 'image/jpeg';
    const safeFileName = payload.fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `payments/${payload.userId}/upi-qr-${Date.now()}-${safeFileName}`;
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
        contentType
      }
    );

    if (!signedUpload) {
      return {
        fileKey,
        uploadUrl: `mock://upload/${fileKey}`,
        fileUrl: `https://mock-storage.local/${fileKey}`,
        mode: 'mock-storage',
        contentType
      };
    }

    return {
      fileKey,
      uploadUrl: signedUpload.uploadUrl,
      fileUrl: signedUpload.fileUrl,
      mode: signedUpload.mode,
      contentType
    };
  }

  async createPaymentMethod(payload: CreateDriverPaymentMethodDto) {
    const user = await this.ensureUser(payload.userId);
    const normalizedUpiId = this.normalizeUpiId(payload.upiId);
    if (!this.isValidUpiId(normalizedUpiId)) {
      throw new BadRequestException('UPI ID must be in valid format (example: name@bank)');
    }

    const normalizedLabel = payload.label?.trim() || undefined;
    const normalizedQrImageUrl = payload.qrImageUrl?.trim() || undefined;
    const driverId = user.driverProfile?.id;

    const activeCount = await this.prisma.driverPaymentMethod.count({
      where: {
        userId: payload.userId,
        isActive: true
      }
    });
    const shouldPrefer = payload.isPreferred === true || activeCount === 0;

    const created = await this.prisma.$transaction(async (tx) => {
      if (shouldPrefer) {
        await tx.driverPaymentMethod.updateMany({
          where: {
            userId: payload.userId,
            isActive: true
          },
          data: {
            isPreferred: false
          }
        });
      }

      return tx.driverPaymentMethod.create({
        data: {
          userId: payload.userId,
          driverId,
          type:
            payload.type ??
            (normalizedQrImageUrl ? DriverPaymentMethodType.UPI_QR : DriverPaymentMethodType.UPI_VPA),
          label: normalizedLabel,
          upiId: normalizedUpiId,
          qrImageUrl: normalizedQrImageUrl,
          isPreferred: shouldPrefer
        }
      });
    });

    await this.prisma.driverOnboarding.updateMany({
      where: {
        userId: payload.userId,
        OR: [{ upiId: null }, { upiId: '' }]
      },
      data: {
        upiId: normalizedUpiId,
        status: OnboardingStatus.IN_PROGRESS
      }
    });

    await this.syncPreferredMethodToPayoutAccount(payload.userId);

    return created;
  }

  async setPreferredPaymentMethod(userId: string, methodId: string) {
    await this.ensureUser(userId);

    const method = await this.prisma.driverPaymentMethod.findFirst({
      where: {
        id: methodId,
        userId,
        isActive: true
      }
    });

    if (!method) {
      throw new NotFoundException('Payment method not found');
    }

    const preferred = await this.prisma.$transaction(async (tx) => {
      await tx.driverPaymentMethod.updateMany({
        where: {
          userId,
          isActive: true
        },
        data: {
          isPreferred: false
        }
      });

      return tx.driverPaymentMethod.update({
        where: { id: methodId },
        data: { isPreferred: true }
      });
    });

    await this.syncPreferredMethodToPayoutAccount(userId);

    return preferred;
  }

  async deletePaymentMethod(userId: string, methodId: string) {
    await this.ensureUser(userId);

    const method = await this.prisma.driverPaymentMethod.findFirst({
      where: {
        id: methodId,
        userId,
        isActive: true
      }
    });

    if (!method) {
      throw new NotFoundException('Payment method not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.driverPaymentMethod.update({
        where: { id: methodId },
        data: {
          isActive: false,
          isPreferred: false
        }
      });

      if (method.isPreferred) {
        const fallbackMethod = await tx.driverPaymentMethod.findFirst({
          where: {
            userId,
            isActive: true,
            id: { not: methodId }
          },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
        });

        if (fallbackMethod) {
          await tx.driverPaymentMethod.update({
            where: { id: fallbackMethod.id },
            data: { isPreferred: true }
          });
        }
      }
    });

    await this.syncPreferredMethodToPayoutAccount(userId);

    return this.listPaymentMethods(userId);
  }

  async me(userId: string) {
    const user = await this.ensureUser(userId);

    const onboarding = await this.prisma.driverOnboarding.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        fullName: user.name,
        phone: user.phone,
        email: user.email,
        status: OnboardingStatus.IN_PROGRESS
      },
      include: {
        documents: true,
        verifications: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    const paymentMethods = await this.listPaymentMethods(userId);

    return {
      ...onboarding,
      paymentMethods
    };
  }

  async upsertProfile(payload: UpsertDriverProfileDto) {
    await this.ensureUser(payload.userId);
    const onboarding = await this.ensureOnboarding(payload.userId);

    return this.prisma.driverOnboarding.update({
      where: { id: onboarding.id },
      data: {
        fullName: payload.fullName ?? onboarding.fullName,
        phone: payload.phone ?? onboarding.phone,
        email: payload.email ?? onboarding.email,
        city: payload.city ?? onboarding.city,
        status:
          onboarding.status === OnboardingStatus.NOT_STARTED
            ? OnboardingStatus.IN_PROGRESS
            : onboarding.status
      }
    });
  }

  async upsertVehicle(payload: UpsertDriverVehicleDto) {
    await this.ensureUser(payload.userId);
    const onboarding = await this.ensureOnboarding(payload.userId);

    return this.prisma.driverOnboarding.update({
      where: { id: onboarding.id },
      data: {
        vehicleType: payload.vehicleType,
        vehicleNumber: payload.vehicleNumber,
        licenseNumber: payload.licenseNumber,
        aadhaarNumber: payload.aadhaarNumber ?? onboarding.aadhaarNumber,
        rcNumber: payload.rcNumber ?? onboarding.rcNumber,
        status: OnboardingStatus.IN_PROGRESS
      }
    });
  }

  async upsertBank(payload: UpsertDriverBankDto) {
    await this.ensureUser(payload.userId);
    const onboarding = await this.ensureOnboarding(payload.userId);
    const normalizedIfsc = payload.ifscCode.trim().toUpperCase();
    const normalizedUpi = this.normalizeUpiId(payload.upiId);

    if (!this.isValidUpiId(normalizedUpi)) {
      throw new BadRequestException('UPI ID must be in valid format (example: name@bank)');
    }

    const normalizedUpiQrImageUrl =
      typeof payload.upiQrImageUrl === 'string' && payload.upiQrImageUrl.trim().length > 0
        ? payload.upiQrImageUrl.trim()
        : null;

    const updateData: Prisma.DriverOnboardingUpdateInput = {
      accountHolderName: payload.accountHolderName.trim(),
      bankName: payload.bankName.trim(),
      accountNumber: payload.accountNumber.trim(),
      ifscCode: normalizedIfsc,
      upiId: normalizedUpi,
      status: OnboardingStatus.IN_PROGRESS
    };

    if (payload.upiQrImageUrl !== undefined) {
      updateData.upiQrImageUrl = normalizedUpiQrImageUrl;
    }

    const updatedOnboarding = await this.prisma.driverOnboarding.update({
      where: { id: onboarding.id },
      data: updateData
    });

    const driverProfile = await this.findDriverProfile(payload.userId);

    if (driverProfile) {
      await this.prisma.driverPayoutAccount.upsert({
        where: { driverId: driverProfile.id },
        update: {
          accountHolderName: updatedOnboarding.accountHolderName ?? payload.accountHolderName.trim(),
          bankName: updatedOnboarding.bankName ?? payload.bankName.trim(),
          accountNumber: updatedOnboarding.accountNumber ?? payload.accountNumber.trim(),
          ifscCode: updatedOnboarding.ifscCode ?? normalizedIfsc,
          upiId: updatedOnboarding.upiId ?? normalizedUpi,
          upiQrImageUrl:
            updatedOnboarding.upiQrImageUrl ??
            normalizedUpiQrImageUrl ??
            undefined
        },
        create: {
          driverId: driverProfile.id,
          accountHolderName: updatedOnboarding.accountHolderName ?? payload.accountHolderName.trim(),
          bankName: updatedOnboarding.bankName ?? payload.bankName.trim(),
          accountNumber: updatedOnboarding.accountNumber ?? payload.accountNumber.trim(),
          ifscCode: updatedOnboarding.ifscCode ?? normalizedIfsc,
          upiId: updatedOnboarding.upiId ?? normalizedUpi,
          upiQrImageUrl:
            updatedOnboarding.upiQrImageUrl ??
            normalizedUpiQrImageUrl ??
            undefined
        }
      });
    }

    await this.ensureDefaultPaymentMethod(
      payload.userId,
      normalizedUpi,
      normalizedUpiQrImageUrl
    );

    return updatedOnboarding;
  }

  async submit(userId: string) {
    const onboarding = await this.ensureOnboarding(userId);
    const missingFields = [
      ['fullName', onboarding.fullName],
      ['phone', onboarding.phone],
      ['vehicleType', onboarding.vehicleType],
      ['vehicleNumber', onboarding.vehicleNumber],
      ['licenseNumber', onboarding.licenseNumber],
      ['accountHolderName', onboarding.accountHolderName],
      ['bankName', onboarding.bankName],
      ['accountNumber', onboarding.accountNumber],
      ['ifscCode', onboarding.ifscCode],
      ['upiId', onboarding.upiId]
    ]
      .filter(([, value]) => !value)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      throw new BadRequestException(`Missing onboarding fields: ${missingFields.join(', ')}`);
    }

    const activePaymentMethods = await this.prisma.driverPaymentMethod.count({
      where: {
        userId,
        isActive: true
      }
    });

    if (activePaymentMethods === 0) {
      throw new BadRequestException('Add at least one UPI payment method before submitting onboarding');
    }

    return this.prisma.driverOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: OnboardingStatus.SUBMITTED,
        submittedAt: new Date()
      }
    });
  }

  async approveFromKyc(userId: string) {
    const onboarding = await this.ensureOnboarding(userId);

    const updated = await this.prisma.driverOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: OnboardingStatus.APPROVED,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null
      }
    });

    if (
      updated.vehicleType &&
      updated.vehicleNumber &&
      updated.licenseNumber &&
      updated.aadhaarNumber
    ) {
      const driverProfile = await this.prisma.driverProfile.upsert({
        where: { userId },
        update: {
          vehicleType: updated.vehicleType,
          vehicleNumber: updated.vehicleNumber,
          licenseNumber: updated.licenseNumber,
          aadhaarNumber: updated.aadhaarNumber,
          verificationStatus: VerificationStatus.APPROVED
        },
        create: {
          userId,
          vehicleType: updated.vehicleType,
          vehicleNumber: updated.vehicleNumber,
          licenseNumber: updated.licenseNumber,
          aadhaarNumber: updated.aadhaarNumber,
          verificationStatus: VerificationStatus.APPROVED
        }
      });

      if (updated.accountHolderName && updated.bankName && updated.accountNumber && updated.ifscCode) {
        await this.prisma.driverPayoutAccount.upsert({
          where: { driverId: driverProfile.id },
          update: {
            accountHolderName: updated.accountHolderName,
            bankName: updated.bankName,
            accountNumber: updated.accountNumber,
            ifscCode: updated.ifscCode,
            upiId: updated.upiId ?? undefined,
            upiQrImageUrl: updated.upiQrImageUrl ?? undefined
          },
          create: {
            driverId: driverProfile.id,
            accountHolderName: updated.accountHolderName,
            bankName: updated.bankName,
            accountNumber: updated.accountNumber,
            ifscCode: updated.ifscCode,
            upiId: updated.upiId ?? undefined,
            upiQrImageUrl: updated.upiQrImageUrl ?? undefined
          }
        });
      }

      await this.syncMethodsToDriverProfile(userId, driverProfile.id);
    }

    if (updated.upiId) {
      await this.ensureDefaultPaymentMethod(userId, updated.upiId, updated.upiQrImageUrl);
      await this.syncPreferredMethodToPayoutAccount(userId);
    }

    return updated;
  }

  async rejectFromKyc(userId: string, reason: string) {
    const onboarding = await this.ensureOnboarding(userId);
    return this.prisma.driverOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: OnboardingStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: reason
      }
    });
  }
}
