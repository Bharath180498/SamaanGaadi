export type UserRole = 'CUSTOMER' | 'DRIVER' | 'ADMIN';

export type VehicleType = 'THREE_WHEELER' | 'MINI_TRUCK' | 'TRUCK';
export type VehicleMatchType = 'EXACT' | 'UPGRADE';

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
export type KycVerificationStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'INCONCLUSIVE';
export type OnboardingStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED';
export type TripOfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

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
  compareAtTotal?: number;
  offerDiscountAmount?: number;
  offerDiscountPercent?: number;
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

export interface TripOffer {
  id: string;
  orderId: string;
  driverId: string;
  status: TripOfferStatus;
  expiresAt: string;
  routeEtaMinutes: number;
  distanceKm?: number;
  vehicleMatchType: VehicleMatchType;
  estimatedDriverPayoutInr?: number;
  currency?: 'INR';
}

export interface OtpRequestInput {
  phone: string;
  role: UserRole;
  name?: string;
}

export interface OtpVerifyInput {
  phone: string;
  role: UserRole;
  code: string;
  name?: string;
}

export interface OtpVerifyResponse {
  token: string;
  sessionId: string;
  expiresAt: string;
  user: {
    id: string;
    role: UserRole;
    name: string;
    phone: string;
  };
}

export interface KycStatus {
  userId: string;
  onboardingStatus: OnboardingStatus;
  latestVerification?: {
    status: KycVerificationStatus;
    provider?: string;
    reviewedAt?: string;
  } | null;
}

export interface OnboardingProgress {
  userId: string;
  status: OnboardingStatus;
  fullName?: string;
  phone?: string;
  vehicleType?: VehicleType;
  submittedAt?: string;
  approvedAt?: string;
}

export interface DispatchDecision {
  orderId: string;
  selectedDriverId?: string;
  assignmentMode: string;
  routeEtaMinutes?: number;
  vehicleMatchType?: VehicleMatchType;
  totalScore?: number;
  reason?: string;
}

export interface OrderEstimateResponse {
  pickup: Coordinates & { address: string };
  drop: Coordinates & { address: string };
  insuranceSelected: InsurancePlan;
  goodsValue: number;
  options: VehicleEstimateOption[];
}
