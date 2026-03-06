import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ConfirmPaymentDto {
  @IsString()
  paymentId!: string;

  @IsBoolean()
  success!: boolean;

  @IsOptional()
  @IsString()
  providerReference?: string;
}
