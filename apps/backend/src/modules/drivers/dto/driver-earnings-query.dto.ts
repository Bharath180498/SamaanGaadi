import { IsDateString, IsOptional } from 'class-validator';

export class DriverEarningsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
