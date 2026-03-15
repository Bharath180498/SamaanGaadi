import { Module } from '@nestjs/common';
import { DriverOnboardingModule } from '../driver-onboarding/driver-onboarding.module';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { IdfyProvider } from './providers/idfy.provider';
import { MockIdfyProvider } from './providers/mock-idfy.provider';
import { CashfreeProvider } from './providers/cashfree.provider';
import { SurepassProvider } from './providers/surepass.provider';

@Module({
  imports: [DriverOnboardingModule],
  controllers: [KycController],
  providers: [
    KycService,
    IdfyProvider,
    MockIdfyProvider,
    CashfreeProvider,
    SurepassProvider
  ],
  exports: [KycService]
})
export class KycModule {}
