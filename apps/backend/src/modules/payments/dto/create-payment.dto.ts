import { PaymentProvider } from '@prisma/client';
import { IsEnum, IsNumber, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  orderId!: string;

  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;

  @IsNumber()
  @Min(1)
  amount!: number;
}
