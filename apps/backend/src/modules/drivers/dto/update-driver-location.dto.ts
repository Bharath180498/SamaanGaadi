import { IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateDriverLocationDto {
  @IsString()
  driverId!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsDateString()
  timestamp!: string;
}
