import type { VehicleType } from './types';

export const BRAND_COLORS = {
  primary: '#F97316',
  secondary: '#0F766E',
  accent: '#0F172A',
  paper: '#FFF8F1',
  muted: '#F1F5F9'
} as const;

export const WAITING_FREE_MINUTES = 20;
export const DEFAULT_WAITING_RATE_PER_MINUTE = 3;

export const VEHICLE_BASE_FARE: Record<VehicleType, number> = {
  THREE_WHEELER: 250,
  MINI_TRUCK: 420,
  TRUCK: 850
};

export const VEHICLE_UI_META: Record<
  VehicleType,
  { label: string; subtitle: string; capacity: string; accent: string }
> = {
  THREE_WHEELER: {
    label: '3 Wheeler',
    subtitle: 'Compact city moves',
    capacity: 'Up to 600 kg',
    accent: '#F59E0B'
  },
  MINI_TRUCK: {
    label: 'Mini Truck',
    subtitle: 'Most popular for daily loads',
    capacity: 'Up to 1.5 tons',
    accent: '#10B981'
  },
  TRUCK: {
    label: 'Truck',
    subtitle: 'Heavy and bulk consignments',
    capacity: 'Up to 9 tons',
    accent: '#3B82F6'
  }
};

export const DISPATCH_WEIGHTS = {
  proximity: 0.45,
  rating: 0.25,
  idleTime: 0.2,
  vehicleMatch: 0.1
} as const;

export const RATING_PRICE_MULTIPLIERS = [
  { min: 4.8, multiplier: 1.0 },
  { min: 4.5, multiplier: 0.97 },
  { min: 4.0, multiplier: 0.92 },
  { min: 0, multiplier: 0.85 }
] as const;
