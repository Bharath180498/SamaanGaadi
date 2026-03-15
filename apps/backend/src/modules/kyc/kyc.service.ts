import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  KycDocStatus,
  Prisma,
  KycVerificationStatus,
  OnboardingStatus,
  VehicleType
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DriverOnboardingService } from '../driver-onboarding/driver-onboarding.service';
import { CreateKycDocumentDto } from './dto/create-kyc-document.dto';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { VerifyIdfyDto } from './dto/verify-idfy.dto';
import { IdfyProvider } from './providers/idfy.provider';
import { KycVerificationProvider } from './providers/kyc-verification.provider';
import { MockIdfyProvider } from './providers/mock-idfy.provider';
import { CashfreeProvider } from './providers/cashfree.provider';
import { SurepassProvider } from './providers/surepass.provider';
import { buildS3UploadUrl } from '../../common/utils/s3-upload.util';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly onboardingService: DriverOnboardingService,
    private readonly idfyProvider: IdfyProvider,
    private readonly cashfreeProvider: CashfreeProvider,
    private readonly surepassProvider: SurepassProvider,
    private readonly mockProvider: MockIdfyProvider
  ) {}

  private get provider(): KycVerificationProvider {
    const mode = this.configService.get<string>('kycProvider') ?? 'mock';
    if (mode === 'idfy') {
      return this.idfyProvider;
    }
    if (mode === 'cashfree') {
      return this.cashfreeProvider;
    }
    if (mode === 'surepass') {
      return this.surepassProvider;
    }
    return this.mockProvider;
  }

  private get providerName() {
    return (this.configService.get<string>('kycProvider') ?? 'mock').trim().toLowerCase();
  }

  private get verifiedReuseWindowMs() {
    const hours = Number(this.configService.get<number>('kycCache.verifiedHours') ?? 2160);
    return Math.max(1, hours) * 60 * 60 * 1000;
  }

  private get nonVerifiedReuseWindowMs() {
    const hours = Number(this.configService.get<number>('kycCache.nonVerifiedHours') ?? 24);
    return Math.max(1, hours) * 60 * 60 * 1000;
  }

  private normalizeFingerprintValue(value: unknown) {
    return typeof value === 'string' ? value.trim().toUpperCase() : undefined;
  }

  private computeInputFingerprint(input: {
    provider: string;
    onboarding: {
      fullName?: string | null;
      phone?: string | null;
      vehicleType?: VehicleType | null;
      aadhaarNumber?: string | null;
      licenseNumber?: string | null;
      rcNumber?: string | null;
      accountNumber?: string | null;
      ifscCode?: string | null;
      upiId?: string | null;
      dateOfBirth?: string | null;
    };
    documents: Array<{
      type: string;
      fileKey: string;
      fileUrl: string;
      updatedAt: Date;
    }>;
  }) {
    const payload = {
      provider: input.provider.trim().toLowerCase(),
      onboarding: {
        fullName: this.normalizeFingerprintValue(input.onboarding.fullName),
        phone: this.normalizeFingerprintValue(input.onboarding.phone),
        vehicleType: this.normalizeFingerprintValue(input.onboarding.vehicleType),
        aadhaarNumber: this.normalizeFingerprintValue(input.onboarding.aadhaarNumber),
        licenseNumber: this.normalizeFingerprintValue(input.onboarding.licenseNumber),
        rcNumber: this.normalizeFingerprintValue(input.onboarding.rcNumber),
        accountNumber: this.normalizeFingerprintValue(input.onboarding.accountNumber),
        ifscCode: this.normalizeFingerprintValue(input.onboarding.ifscCode),
        upiId: this.normalizeFingerprintValue(input.onboarding.upiId),
        dateOfBirth: this.normalizeFingerprintValue(input.onboarding.dateOfBirth)
      },
      documents: [...input.documents]
        .map((doc) => ({
          type: doc.type,
          fileKey: doc.fileKey,
          fileUrl: doc.fileUrl,
          updatedAt: doc.updatedAt.toISOString()
        }))
        .sort((a, b) => `${a.type}:${a.fileKey}`.localeCompare(`${b.type}:${b.fileKey}`))
    };

    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private extractStoredFingerprint(verification: {
    providerResponse: Prisma.JsonValue | null;
  }) {
    const payload = verification.providerResponse;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return undefined;
    }

    const root = payload as Record<string, unknown>;
    const direct = root._inputFingerprint;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    const meta = root._qargo;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      return undefined;
    }

    const fingerprint = (meta as Record<string, unknown>).inputFingerprint;
    if (typeof fingerprint === 'string' && fingerprint.trim()) {
      return fingerprint.trim();
    }

    return undefined;
  }

  private reuseWindowMs(status: KycVerificationStatus) {
    if (status === KycVerificationStatus.VERIFIED) {
      return this.verifiedReuseWindowMs;
    }
    return 0;
  }

  private extractVehicleTypeOverride(providerResponse: Record<string, unknown>) {
    const directVehicleType = providerResponse.derivedVehicleType;
    if (typeof directVehicleType === 'string') {
      if (
        directVehicleType === VehicleType.THREE_WHEELER ||
        directVehicleType === VehicleType.MINI_TRUCK ||
        directVehicleType === VehicleType.TRUCK
      ) {
        return directVehicleType;
      }
    }

    const qargoMeta = providerResponse._qargo;
    if (!qargoMeta || typeof qargoMeta !== 'object' || Array.isArray(qargoMeta)) {
      return undefined;
    }

    const candidate = (qargoMeta as Record<string, unknown>).derivedVehicleType;
    if (typeof candidate !== 'string') {
      return undefined;
    }

    if (
      candidate === VehicleType.THREE_WHEELER ||
      candidate === VehicleType.MINI_TRUCK ||
      candidate === VehicleType.TRUCK
    ) {
      return candidate;
    }

    return undefined;
  }

  private asRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private pickString(...candidates: unknown[]) {
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }
      const normalized = candidate.trim();
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  private cityFromAddress(address?: string) {
    if (!address) {
      return undefined;
    }
    const chunks = address
      .split(',')
      .map((part) => part.trim())
      .filter((part) => Boolean(part));
    if (chunks.length === 0) {
      return undefined;
    }

    const normalized = chunks
      .map((part) => part.replace(/\b\d{3,}\b/g, '').replace(/\s+/g, ' ').trim())
      .filter((part) => Boolean(part));

    if (normalized.length === 0) {
      return undefined;
    }

    const removeRtoSuffix = (value: string) => value.replace(/\bRTO\b.*$/i, '').trim();
    if (normalized.length >= 2) {
      return removeRtoSuffix(normalized[normalized.length - 2]) || normalized[normalized.length - 2];
    }

    return removeRtoSuffix(normalized[0]) || normalized[0];
  }

  private normalizeProfileImageDataUrl(raw?: string) {
    const value = this.pickString(raw);
    if (!value) {
      return undefined;
    }
    if (value.startsWith('data:')) {
      return value;
    }
    return `data:image/jpeg;base64,${value}`;
  }

  private extractVerificationEnrichment(providerResponse: Record<string, unknown>) {
    const checks = Array.isArray(providerResponse.checks) ? providerResponse.checks : [];
    const drivingLicenseCheck = checks.find((entry) => this.asRecord(entry)?.name === 'driving_license');
    const rcCheck = checks.find((entry) => this.asRecord(entry)?.name === 'rc');

    const drivingLicensePayload = this.asRecord(this.asRecord(drivingLicenseCheck)?.payload);
    const rcPayload = this.asRecord(this.asRecord(rcCheck)?.payload);

    const dlData = this.asRecord(drivingLicensePayload?.data);
    const rcData = this.asRecord(rcPayload?.data);

    const licenseClasses = Array.isArray(dlData?.vehicle_classes)
      ? dlData?.vehicle_classes
          .map((entry) => this.pickString(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [];

    const verifiedAddress = this.pickString(
      dlData?.permanent_address,
      dlData?.temporary_address,
      rcData?.present_address,
      rcData?.permanent_address
    );
    const registeredAt = this.pickString(rcData?.registered_at);
    const cityFromAddress = this.cityFromAddress(verifiedAddress);
    const city = cityFromAddress ?? this.cityFromAddress(registeredAt);
    const profileImageDataUrl = this.normalizeProfileImageDataUrl(
      this.pickString(dlData?.profile_image)
    );

    return {
      fullName: this.pickString(dlData?.name, rcData?.owner_name),
      dateOfBirth: this.pickString(dlData?.dob),
      address: verifiedAddress,
      city,
      registeredAt,
      vehicleModel: this.pickString(rcData?.maker_model, rcData?.maker_description),
      vehicleCategory: this.pickString(
        rcData?.vehicle_category_description,
        rcData?.vehicle_category
      ),
      licenseClasses,
      profileImageDataUrl
    };
  }

  private async syncOnboardingFromVerification(
    userId: string,
    onboardingId: string,
    enrichment: {
      fullName?: string;
      dateOfBirth?: string;
      city?: string;
    }
  ) {
    const onboardingUpdate: Prisma.DriverOnboardingUpdateInput = {};

    if (enrichment.fullName) {
      onboardingUpdate.fullName = enrichment.fullName;
    }

    if (enrichment.dateOfBirth) {
      onboardingUpdate.dateOfBirth = enrichment.dateOfBirth;
    }

    if (enrichment.city) {
      onboardingUpdate.city = enrichment.city;
    }

    if (Object.keys(onboardingUpdate).length > 0) {
      await this.prisma.driverOnboarding.update({
        where: { id: onboardingId },
        data: onboardingUpdate
      });
    }

    if (enrichment.fullName) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { name: enrichment.fullName }
      });
    }
  }

  private isReusableVerification(
    verification: {
      status: KycVerificationStatus;
      createdAt: Date;
      providerResponse: Prisma.JsonValue | null;
    },
    fingerprint: string
  ) {
    const storedFingerprint = this.extractStoredFingerprint(verification);
    if (!storedFingerprint || storedFingerprint !== fingerprint) {
      return false;
    }

    const windowMs = this.reuseWindowMs(verification.status);
    if (windowMs <= 0) {
      return false;
    }

    return Date.now() - verification.createdAt.getTime() <= windowMs;
  }

  async generateUploadUrl(payload: GenerateUploadUrlDto) {
    const fileKey = `kyc/${payload.userId}/${payload.type.toLowerCase()}-${Date.now()}-${payload.fileName}`;
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
        fileKey
      }
    );

    if (!signedUpload) {
      return {
        fileKey,
        uploadUrl: `mock://upload/${fileKey}`,
        fileUrl: `https://mock-storage.local/${fileKey}`,
        mode: 'mock-storage'
      };
    }

    return {
      fileKey,
      uploadUrl: signedUpload.uploadUrl,
      fileUrl: signedUpload.fileUrl,
      mode: signedUpload.mode
    };
  }

  async createDocument(payload: CreateKycDocumentDto) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const onboarding = await this.prisma.driverOnboarding.findUnique({
      where: { userId: payload.userId }
    });

    return this.prisma.kycDocument.create({
      data: {
        userId: payload.userId,
        onboardingId: payload.onboardingId ?? onboarding?.id,
        type: payload.type,
        fileKey: payload.fileKey,
        fileUrl: payload.fileUrl,
        mimeType: payload.mimeType,
        fileSizeBytes: payload.fileSizeBytes
      }
    });
  }

  async verifyIdfy(payload: VerifyIdfyDto) {
    const provider = this.providerName;
    const onboarding = await this.prisma.driverOnboarding.findUnique({
      where: { userId: payload.userId }
    });

    if (!onboarding) {
      throw new NotFoundException('Onboarding record not found');
    }

    const docs = await this.prisma.kycDocument.findMany({
      where: { userId: payload.userId },
      orderBy: { createdAt: 'desc' }
    });
    const fingerprint = this.computeInputFingerprint({
      provider,
      onboarding: {
        fullName: onboarding.fullName,
        phone: onboarding.phone,
        vehicleType: onboarding.vehicleType,
        aadhaarNumber: onboarding.aadhaarNumber,
        licenseNumber: onboarding.licenseNumber,
        rcNumber: onboarding.rcNumber,
        accountNumber: onboarding.accountNumber,
        ifscCode: onboarding.ifscCode,
        upiId: onboarding.upiId,
        dateOfBirth: onboarding.dateOfBirth
      },
      documents: docs.map((doc) => ({
        type: doc.type,
        fileKey: doc.fileKey,
        fileUrl: doc.fileUrl,
        updatedAt: doc.updatedAt
      }))
    });

    const previousVerifications = await this.prisma.kycVerification.findMany({
      where: {
        userId: payload.userId,
        onboardingId: onboarding.id,
        provider
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const reusable = previousVerifications.find((verification) =>
      this.isReusableVerification(verification, fingerprint)
    );

    if (reusable) {
      return {
        ...reusable,
        reused: true
      };
    }

    const result = await this.provider.verify({
      userId: payload.userId,
      documents: docs.map((doc) => ({
        type: doc.type,
        fileUrl: doc.fileUrl
      })),
      onboarding: {
        fullName: onboarding.fullName,
        phone: onboarding.phone,
        vehicleType: onboarding.vehicleType,
        aadhaarNumber: onboarding.aadhaarNumber,
        licenseNumber: onboarding.licenseNumber,
        rcNumber: onboarding.rcNumber,
        accountNumber: onboarding.accountNumber,
        ifscCode: onboarding.ifscCode,
        upiId: onboarding.upiId,
        dateOfBirth: onboarding.dateOfBirth
      }
    });

    const providerResponseBase =
      result.providerResponse && typeof result.providerResponse === 'object'
        ? (result.providerResponse as Record<string, unknown>)
        : {
            value: result.providerResponse
          };
    const providerResponseQargoMeta =
      providerResponseBase._qargo &&
      typeof providerResponseBase._qargo === 'object' &&
      !Array.isArray(providerResponseBase._qargo)
        ? (providerResponseBase._qargo as Record<string, unknown>)
        : {};
    const profileEnrichment = this.extractVerificationEnrichment(providerResponseBase);

    await this.syncOnboardingFromVerification(payload.userId, onboarding.id, {
      fullName: profileEnrichment.fullName,
      dateOfBirth: profileEnrichment.dateOfBirth,
      city: profileEnrichment.city
    });

    const vehicleTypeOverride = this.extractVehicleTypeOverride(providerResponseBase);
    if (vehicleTypeOverride && onboarding.vehicleType !== vehicleTypeOverride) {
      await this.prisma.driverOnboarding.update({
        where: { id: onboarding.id },
        data: {
          vehicleType: vehicleTypeOverride
        }
      });
    }

    const verification = await this.prisma.kycVerification.create({
      data: {
        userId: payload.userId,
        onboardingId: onboarding.id,
        provider,
        providerRef: result.providerRef,
        status: result.status,
        riskSignals: result.riskSignals as Prisma.InputJsonValue,
        providerResponse: {
          ...providerResponseBase,
          _inputFingerprint: fingerprint,
          _qargo: {
            ...providerResponseQargoMeta,
            inputFingerprint: fingerprint,
            provider,
            generatedAt: new Date().toISOString(),
            reused: false,
            profileSummary: {
              fullName: profileEnrichment.fullName ?? null,
              dateOfBirth: profileEnrichment.dateOfBirth ?? null,
              address: profileEnrichment.address ?? null,
              city: profileEnrichment.city ?? null,
              registeredAt: profileEnrichment.registeredAt ?? null,
              vehicleModel: profileEnrichment.vehicleModel ?? null,
              vehicleCategory: profileEnrichment.vehicleCategory ?? null,
              licenseClasses: profileEnrichment.licenseClasses,
              hasProfileImage: Boolean(profileEnrichment.profileImageDataUrl)
            }
          }
        } as Prisma.InputJsonValue
      }
    });

    if (result.status === KycVerificationStatus.VERIFIED) {
      await this.prisma.kycDocument.updateMany({
        where: {
          userId: payload.userId,
          status: KycDocStatus.UPLOADED
        },
        data: {
          status: KycDocStatus.VERIFIED
        }
      });
      await this.onboardingService.approveFromKyc(payload.userId);
    } else if (result.status === KycVerificationStatus.REJECTED) {
      await this.onboardingService.rejectFromKyc(payload.userId, 'KYC rejected by provider');
    } else {
      await this.prisma.driverOnboarding.update({
        where: { id: onboarding.id },
        data: {
          status: OnboardingStatus.IN_PROGRESS
        }
      });
    }

    return verification;
  }

  async status(userId: string) {
    const [onboarding, documents, verification] = await Promise.all([
      this.prisma.driverOnboarding.findUnique({
        where: { userId }
      }),
      this.prisma.kycDocument.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.kycVerification.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return {
      userId,
      onboardingStatus: onboarding?.status ?? OnboardingStatus.NOT_STARTED,
      onboarding,
      latestVerification: verification,
      documents
    };
  }

  pendingReview() {
    return this.prisma.kycVerification.findMany({
      where: {
        status: {
          in: [KycVerificationStatus.INCONCLUSIVE, KycVerificationStatus.IN_REVIEW]
        }
      },
      include: {
        user: true,
        onboarding: true
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  history(status: KycVerificationStatus = KycVerificationStatus.VERIFIED, limit = 100) {
    const take = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 500) : 100;

    return this.prisma.kycVerification.findMany({
      where: { status },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true
          }
        },
        onboarding: true,
        reviewedByAdmin: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true
          }
        }
      },
      orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
      take
    });
  }

  async reviewDetails(verificationId: string) {
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            role: true,
            createdAt: true
          }
        },
        onboarding: true,
        reviewedByAdmin: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true
          }
        }
      }
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    const [documents, verificationHistory, driverProfile] = await Promise.all([
      this.prisma.kycDocument.findMany({
        where: { userId: verification.userId },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.kycVerification.findMany({
        where: { userId: verification.userId },
        include: {
          reviewedByAdmin: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.driverProfile.findUnique({
        where: { userId: verification.userId },
        include: {
          vehicles: true,
          payoutAccount: true,
          paymentMethods: {
            where: { isActive: true },
            orderBy: [{ isPreferred: 'desc' }, { createdAt: 'desc' }],
            take: 5
          }
        }
      })
    ]);

    return {
      verification,
      user: verification.user,
      onboarding: verification.onboarding,
      documents,
      verificationHistory,
      driverProfile
    };
  }

  async approve(verificationId: string, adminUserId: string) {
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId }
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    const updated = await this.prisma.kycVerification.update({
      where: { id: verification.id },
      data: {
        status: KycVerificationStatus.VERIFIED,
        reviewedByAdminId: adminUserId,
        reviewedAt: new Date(),
        reviewNotes: 'Approved manually by admin'
      }
    });

    await this.prisma.kycDocument.updateMany({
      where: {
        userId: verification.userId,
        status: KycDocStatus.UPLOADED
      },
      data: {
        status: KycDocStatus.VERIFIED
      }
    });
    await this.onboardingService.approveFromKyc(verification.userId);

    return updated;
  }

  async reject(verificationId: string, adminUserId: string, reason: string) {
    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId }
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    const updated = await this.prisma.kycVerification.update({
      where: { id: verification.id },
      data: {
        status: KycVerificationStatus.REJECTED,
        reviewedByAdminId: adminUserId,
        reviewedAt: new Date(),
        reviewNotes: reason || 'Rejected manually by admin'
      }
    });

    await this.onboardingService.rejectFromKyc(verification.userId, reason || 'Manual rejection');

    return updated;
  }
}
