import { InsurancePlan, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
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

export class EstimateOrderDto {
  @ValidateNested()
  @Type(() => LocationInput)
  pickup!: LocationInput;

  @ValidateNested()
  @Type(() => LocationInput)
  drop!: LocationInput;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsString()
  goodsType?: string;

  @IsOptional()
  @IsNumber()
  @Min(100)
  goodsValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  minDriverRating?: number;

  @IsOptional()
  @IsEnum(InsurancePlan)
  insuranceSelected?: InsurancePlan;
}
