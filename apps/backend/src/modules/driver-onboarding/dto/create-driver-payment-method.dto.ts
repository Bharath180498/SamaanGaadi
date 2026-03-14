import { ApiProperty } from '@nestjs/swagger';
import { DriverPaymentMethodType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class CreateDriverPaymentMethodDto {
  @ApiProperty({ example: 'user-id' })
  @IsString()
  userId!: string;

  @ApiProperty({ enum: DriverPaymentMethodType, required: false, default: DriverPaymentMethodType.UPI_VPA })
  @IsOptional()
  @IsEnum(DriverPaymentMethodType)
  type?: DriverPaymentMethodType;

  @ApiProperty({ example: 'PhonePe QR', required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ example: 'driver@okaxis' })
  @IsString()
  @Matches(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/i, {
    message: 'UPI ID must be in valid format (example: name@bank)'
  })
  upiId!: string;

  @ApiProperty({ example: 'https://cdn.example.com/driver-upi-qr.png', required: false })
  @IsOptional()
  @IsString()
  qrImageUrl?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}
