import { InsurancePlan, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from 'class-validator';

class LocationInput {
  @IsString()
  address!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

export class CreateOrderDto {
  @IsString()
  customerId!: string;

  @ValidateNested()
  @Type(() => LocationInput)
  pickup!: LocationInput;

  @ValidateNested()
  @Type(() => LocationInput)
  drop!: LocationInput;

  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @IsString()
  goodsDescription!: string;

  @IsOptional()
  @IsString()
  goodsType?: string;

  @IsNumber()
  @Min(100)
  goodsValue!: number;

  @IsOptional()
  @IsEnum(InsurancePlan)
  insuranceSelected?: InsurancePlan;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  hsnCode?: string;

  @IsOptional()
  @IsNumber()
  invoiceValue?: number;
}
