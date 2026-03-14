import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KycDocStatus,
  Prisma,
  KycVerificationStatus,
  OnboardingStatus
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
import { QuickeKycProvider } from './providers/quickekyc.provider';
import { buildS3UploadUrl } from '../../common/utils/s3-upload.util';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly onboardingService: DriverOnboardingService,
    private readonly idfyProvider: IdfyProvider,
    private readonly cashfreeProvider: CashfreeProvider,
    private readonly quickeKycProvider: QuickeKycProvider,
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
    if (mode === 'quickekyc') {
      return this.quickeKycProvider;
    }
    return this.mockProvider;
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

    const result = await this.provider.verify({
      userId: payload.userId,
      documents: docs.map((doc) => ({
        type: doc.type,
        fileUrl: doc.fileUrl
      })),
      onboarding: {
        fullName: onboarding.fullName,
        phone: onboarding.phone,
        aadhaarNumber: onboarding.aadhaarNumber,
        licenseNumber: onboarding.licenseNumber,
        rcNumber: onboarding.rcNumber,
        accountNumber: onboarding.accountNumber,
        ifscCode: onboarding.ifscCode,
        upiId: onboarding.upiId
      }
    });

    const verification = await this.prisma.kycVerification.create({
      data: {
        userId: payload.userId,
        onboardingId: onboarding.id,
        provider: this.configService.get<string>('kycProvider') ?? 'mock',
        providerRef: result.providerRef,
        status: result.status,
        riskSignals: result.riskSignals as Prisma.InputJsonValue,
        providerResponse: result.providerResponse as Prisma.InputJsonValue
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
          status: OnboardingStatus.SUBMITTED
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
