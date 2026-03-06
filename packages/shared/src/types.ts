export type UserRole = 'CUSTOMER' | 'DRIVER' | 'ADMIN';

export type VehicleType = 'THREE_WHEELER' | 'MINI_TRUCK' | 'TRUCK';

export type OrderStatus =
  | 'CREATED'
  | 'MATCHING'
  | 'ASSIGNED'
  | 'AT_PICKUP'
  | 'LOADING'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

export type InsurancePlan = 'NONE' | 'BASIC' | 'PREMIUM' | 'HIGH_VALUE';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface PriceBreakdown {
  baseFare: number;
  distanceFare: number;
  waitingCharge: number;
  insuranceCharge: number;
  discount: number;
  total: number;
}

export interface DispatchScoreBreakdown {
  proximity: number;
  rating: number;
  idle: number;
  vehicle: number;
  total: number;
}

export interface VehicleEstimateOption {
  vehicleType: VehicleType;
  distanceKm: number;
  etaMinutes: number;
  availableDrivers: number;
  pricing: PriceBreakdown & { multiplier: number };
  topDriver: {
    driverId: string;
    rating: number;
    distanceKm: number;
  } | null;
}

export interface OrderEstimateResponse {
  pickup: Coordinates & { address: string };
  drop: Coordinates & { address: string };
  insuranceSelected: InsurancePlan;
  goodsValue: number;
  options: VehicleEstimateOption[];
}
