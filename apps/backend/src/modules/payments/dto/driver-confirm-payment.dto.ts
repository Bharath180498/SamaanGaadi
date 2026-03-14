import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DriverConfirmPaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  providerReference?: string;
}
