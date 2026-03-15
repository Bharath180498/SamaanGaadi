import { KycDocType, KycVerificationStatus, VehicleType } from '@prisma/client';

export interface VerifyKycInput {
  userId: string;
  documents: Array<{
    type: KycDocType;
    fileUrl: string;
  }>;
  onboarding?: {
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
}

export interface VerifyKycResult {
  status: KycVerificationStatus;
  providerRef: string;
  riskSignals: string[];
  providerResponse: Record<string, unknown>;
}

export interface KycVerificationProvider {
  verify(input: VerifyKycInput): Promise<VerifyKycResult>;
}
