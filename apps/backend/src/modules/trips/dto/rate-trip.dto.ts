import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RateTripDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  driverRating!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  customerRating?: number;

  @IsOptional()
  @IsString()
  review?: string;
}
