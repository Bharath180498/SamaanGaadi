import { PaymentProvider } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  orderId!: string;

  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;

  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsBoolean()
  directPayToDriver?: boolean;

  @IsOptional()
  @IsString()
  directUpiVpa?: string;

  @IsOptional()
  @IsString()
  directUpiName?: string;

  @IsOptional()
  @IsString()
  driverPaymentMethodId?: string;

  @IsOptional()
  @IsBoolean()
  applySurcharge?: boolean;
}
