import { DriverSubscriptionPlan } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateDriverSubscriptionDto {
  @IsEnum(DriverSubscriptionPlan)
  plan!: DriverSubscriptionPlan;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  fleetSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  notes?: string;
}
