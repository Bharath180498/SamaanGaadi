import { AvailabilityStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetDriverAvailabilityDto {
  @IsEnum(AvailabilityStatus)
  status!: AvailabilityStatus;
}
