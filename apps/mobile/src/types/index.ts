import type {
  InsurancePlan,
  OrderStatus,
  VehicleEstimateOption,
  VehicleType
} from '@porter/shared';

export interface SessionUser {
  id: string;
  name: string;
  role: 'CUSTOMER' | 'DRIVER' | 'ADMIN';
  phone: string;
}

export interface BookingInput {
  pickup: {
    address: string;
    lat: number;
    lng: number;
  };
  drop: {
    address: string;
    lat: number;
    lng: number;
  };
  vehicleType: VehicleType;
  goodsDescription: string;
  goodsValue: number;
  goodsType?: string;
  insuranceSelected?: InsurancePlan;
  gstin?: string;
  hsnCode?: string;
  invoiceValue?: number;
}

export interface BookingEstimateInput {
  pickup: {
    address: string;
    lat: number;
    lng: number;
  };
  drop: {
    address: string;
    lat: number;
    lng: number;
  };
  goodsType?: string;
  goodsValue: number;
  insuranceSelected?: InsurancePlan;
  minDriverRating?: number;
}

export interface InsuranceQuoteOption {
  plan: InsurancePlan;
  premium: number;
  coverage: number;
  deductible: number;
}

export interface ActiveOrder {
  id: string;
  status: OrderStatus;
  estimatedPrice: number;
  driverId?: string;
}

export interface VehicleQuote extends VehicleEstimateOption {}
