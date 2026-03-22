import { IsOptional, IsString, Matches } from 'class-validator';

export class TripDriverActionDto {
  @IsString()
  driverId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'rideStartOtp must be a 6-digit code' })
  rideStartOtp?: string;
}
