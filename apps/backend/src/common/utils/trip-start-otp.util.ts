import { randomInt } from 'node:crypto';
import { TripStatus } from '@prisma/client';

export const TRIP_START_OTP_TTL_SECONDS = 12 * 60 * 60;

export const TRIP_START_OTP_VISIBLE_STATUSES: TripStatus[] = [
  TripStatus.ASSIGNED,
  TripStatus.DRIVER_EN_ROUTE,
  TripStatus.ARRIVED_PICKUP
];

export function buildTripStartOtpRedisKey(tripId: string) {
  return `trip:${tripId}:start-otp`;
}

export function generateTripStartOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
