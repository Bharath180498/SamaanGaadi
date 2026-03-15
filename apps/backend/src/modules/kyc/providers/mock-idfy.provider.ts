import { Injectable } from '@nestjs/common';
import { KycDocType, KycVerificationStatus } from '@prisma/client';
import {
  KycVerificationProvider,
  VerifyKycInput,
  VerifyKycResult
} from './kyc-verification.provider';

const REQUIRED_DOCS: KycDocType[] = [
  KycDocType.LICENSE_FRONT,
  KycDocType.RC_FRONT,
  KycDocType.SELFIE
];

@Injectable()
export class MockIdfyProvider implements KycVerificationProvider {
  async verify(input: VerifyKycInput): Promise<VerifyKycResult> {
    const provided = new Set(input.documents.map((doc) => doc.type));
    const missingDocs = REQUIRED_DOCS.filter((doc) => !provided.has(doc));

    if (missingDocs.length > 0) {
      return {
        status: KycVerificationStatus.INCONCLUSIVE,
        providerRef: `mock_inconclusive_${Date.now()}`,
        riskSignals: [`Missing docs: ${missingDocs.join(', ')}`],
        providerResponse: {
          mode: 'mock',
          missingDocs
        }
      };
    }

    return {
      status: KycVerificationStatus.VERIFIED,
      providerRef: `mock_verified_${Date.now()}`,
      riskSignals: [],
      providerResponse: {
        mode: 'mock',
        matchScore: 0.94
      }
    };
  }
}
