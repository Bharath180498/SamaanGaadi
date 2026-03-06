import { IsNumber, IsOptional, Min } from 'class-validator';

export class CompleteTripDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;
}
