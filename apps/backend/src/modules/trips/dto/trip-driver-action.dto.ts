import { IsString } from 'class-validator';

export class TripDriverActionDto {
  @IsString()
  driverId!: string;
}
