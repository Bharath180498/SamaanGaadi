import { create } from 'zustand';
import type { InsurancePlan, OrderEstimateResponse } from '@porter/shared';
import api from '../services/api';
import type {
  BookingEstimateInput,
  BookingInput,
  InsuranceQuoteOption,
  VehicleQuote
} from '../types';
import { useSessionStore } from './useSessionStore';

export interface RoutePoint {
  address: string;
  lat: number;
  lng: number;
}

export type PaymentMethod = 'VISA_5496' | 'MASTERCARD_6802' | 'UPI_SCAN_PAY' | 'CASH';

interface CustomerState {
  activeOrderId?: string;
  estimatedPrice?: number;
  dispatchMode?: string;
  selectedVehicle?: VehicleQuote;
  quotes: VehicleQuote[];
  draftPickup?: RoutePoint;
  draftDrop?: RoutePoint;
  goodsDescription: string;
  goodsType: string;
  goodsValue: number;
  insuranceSelected: InsurancePlan;
  minDriverRating: number;
  gstin: string;
  hsnCode: string;
  invoiceValue?: number;
  autoGenerateEwayBill: boolean;
  generatedEwayBillNumber?: string;
  paymentMethod: PaymentMethod;
  insuranceQuotes: InsuranceQuoteOption[];
  insuranceLoading: boolean;
  estimateLoading: boolean;
  creating: boolean;
  error?: string;
  setDraftRoute: (input: {
    pickup?: RoutePoint | null;
    drop?: RoutePoint | null;
    goodsDescription?: string;
    goodsValue?: number;
  }) => void;
  setShipmentDetails: (input: {
    goodsDescription?: string;
    goodsType?: string;
    goodsValue?: number;
    insuranceSelected?: InsurancePlan;
    minDriverRating?: number;
    gstin?: string;
    hsnCode?: string;
    invoiceValue?: number | null;
    autoGenerateEwayBill?: boolean;
  }) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  fetchQuotes: (input?: BookingEstimateInput) => Promise<void>;
  fetchInsuranceQuotes: () => Promise<void>;
  selectVehicle: (vehicleType: BookingInput['vehicleType']) => void;
  createBooking: (input: BookingInput) => Promise<void>;
  refreshOrder: () => Promise<any>;
  refreshTimeline: () => Promise<any>;
  refreshLocationHistory: () => Promise<any>;
  clearError: () => void;
  resetBookingFlow: () => void;
}

const DEFAULTS = {
  goodsDescription: 'General merchandise',
  goodsType: 'General',
  goodsValue: 45000,
  minDriverRating: 4,
  insuranceSelected: 'BASIC' as InsurancePlan,
  gstin: '',
  hsnCode: '',
  invoiceValue: undefined as number | undefined,
  autoGenerateEwayBill: false
};

function errorMessage(error: unknown, fallback: string) {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : fallback;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  quotes: [],
  draftPickup: undefined,
  draftDrop: undefined,
  goodsDescription: DEFAULTS.goodsDescription,
  goodsType: DEFAULTS.goodsType,
  goodsValue: DEFAULTS.goodsValue,
  insuranceSelected: DEFAULTS.insuranceSelected,
  minDriverRating: DEFAULTS.minDriverRating,
  gstin: DEFAULTS.gstin,
  hsnCode: DEFAULTS.hsnCode,
  invoiceValue: DEFAULTS.invoiceValue,
  autoGenerateEwayBill: DEFAULTS.autoGenerateEwayBill,
  generatedEwayBillNumber: undefined,
  paymentMethod: 'VISA_5496',
  insuranceQuotes: [],
  insuranceLoading: false,
  estimateLoading: false,
  creating: false,
  clearError() {
    set({ error: undefined });
  },
  setDraftRoute(input) {
    set((state) => ({
      draftPickup:
        input.pickup === undefined
          ? state.draftPickup
          : input.pickup === null
            ? undefined
            : input.pickup,
      draftDrop:
        input.drop === undefined ? state.draftDrop : input.drop === null ? undefined : input.drop,
      goodsDescription: input.goodsDescription ?? state.goodsDescription,
      goodsValue: input.goodsValue ?? state.goodsValue
    }));
  },
  setShipmentDetails(input) {
    set((state) => ({
      goodsDescription: input.goodsDescription ?? state.goodsDescription,
      goodsType: input.goodsType ?? state.goodsType,
      goodsValue: input.goodsValue ?? state.goodsValue,
      insuranceSelected: input.insuranceSelected ?? state.insuranceSelected,
      minDriverRating: input.minDriverRating ?? state.minDriverRating,
      gstin: input.gstin ?? state.gstin,
      hsnCode: input.hsnCode ?? state.hsnCode,
      invoiceValue:
        input.invoiceValue === undefined
          ? state.invoiceValue
          : input.invoiceValue === null
            ? undefined
            : input.invoiceValue,
      autoGenerateEwayBill: input.autoGenerateEwayBill ?? state.autoGenerateEwayBill
    }));
  },
  setPaymentMethod(method) {
    set({ paymentMethod: method });
  },
  resetBookingFlow() {
    set({
      quotes: [],
      selectedVehicle: undefined,
      estimatedPrice: undefined,
      draftPickup: undefined,
      draftDrop: undefined,
      insuranceQuotes: [],
      generatedEwayBillNumber: undefined,
      goodsDescription: DEFAULTS.goodsDescription,
      goodsType: DEFAULTS.goodsType,
      goodsValue: DEFAULTS.goodsValue,
      insuranceSelected: DEFAULTS.insuranceSelected,
      minDriverRating: DEFAULTS.minDriverRating,
      gstin: DEFAULTS.gstin,
      hsnCode: DEFAULTS.hsnCode,
      invoiceValue: DEFAULTS.invoiceValue,
      autoGenerateEwayBill: DEFAULTS.autoGenerateEwayBill,
      error: undefined,
      insuranceLoading: false,
      estimateLoading: false,
      creating: false
    });
  },
  async fetchInsuranceQuotes() {
    const state = get();

    set({ insuranceLoading: true, error: undefined });

    try {
      const response = await api.post('/insurance/quote', {
        goodsType: state.goodsType,
        goodsValue: state.goodsValue
      });

      const options = (response.data?.options ?? []) as InsuranceQuoteOption[];
      set({
        insuranceQuotes: options,
        insuranceLoading: false,
        insuranceSelected:
          options.find((entry) => entry.plan === state.insuranceSelected)?.plan ??
          options[0]?.plan ??
          state.insuranceSelected
      });
    } catch (error: unknown) {
      set({
        insuranceLoading: false,
        error: errorMessage(error, 'Unable to fetch insurance quotes')
      });
      throw error;
    }
  },
  async fetchQuotes(input) {
    const state = get();

    const pickup = input?.pickup ?? state.draftPickup;
    const drop = input?.drop ?? state.draftDrop;

    if (!pickup || !drop) {
      throw new Error('Pickup and drop points are required to fetch quotes');
    }

    set({ estimateLoading: true, error: undefined });

    try {
      const response = await api.post<OrderEstimateResponse>('/orders/estimate', {
        pickup,
        drop,
        goodsType: input?.goodsType ?? state.goodsType,
        goodsValue: input?.goodsValue ?? state.goodsValue,
        insuranceSelected: input?.insuranceSelected ?? state.insuranceSelected,
        minDriverRating: input?.minDriverRating ?? state.minDriverRating
      });

      const quotes = response.data.options ?? [];
      const selectedVehicle = quotes[0];

      set({
        quotes,
        selectedVehicle,
        estimatedPrice: selectedVehicle?.pricing.total,
        estimateLoading: false,
        error: undefined
      });
    } catch (error: unknown) {
      set({
        estimateLoading: false,
        error: errorMessage(error, 'Unable to fetch quotes')
      });
      throw error;
    }
  },
  selectVehicle(vehicleType) {
    const selectedVehicle = get().quotes.find((item) => item.vehicleType === vehicleType);
    if (!selectedVehicle) {
      return;
    }

    set({
      selectedVehicle,
      estimatedPrice: selectedVehicle.pricing.total
    });
  },
  async createBooking(input) {
    const user = useSessionStore.getState().user;
    if (!user) {
      throw new Error('User not logged in');
    }

    const state = get();
    set({ creating: true, error: undefined });

    try {
      const finalGstin = input.gstin ?? state.gstin;
      const finalHsn = input.hsnCode ?? state.hsnCode;
      const finalInvoiceValue = input.invoiceValue ?? state.invoiceValue;

      const payload = {
        customerId: user.id,
        ...input,
        goodsType: input.goodsType ?? state.goodsType,
        insuranceSelected: input.insuranceSelected ?? state.insuranceSelected,
        gstin: finalGstin || undefined,
        hsnCode: finalHsn || undefined,
        invoiceValue: finalInvoiceValue
      };

      const response = await api.post('/orders', payload);

      let ewayBillNumber: string | undefined;
      const orderId = response.data.order_id as string;
      const invoiceValue = payload.invoiceValue ?? payload.goodsValue;

      const shouldGenerateEway =
        state.autoGenerateEwayBill &&
        Boolean(payload.gstin) &&
        Boolean(payload.hsnCode) &&
        typeof invoiceValue === 'number';

      if (shouldGenerateEway) {
        const ewayResponse = await api.post(`/orders/${orderId}/ewaybill`, {
          gstin: payload.gstin,
          invoiceValue,
          hsnCode: payload.hsnCode,
          vehicleNumber: `TBD-${input.vehicleType}`
        });

        ewayBillNumber = ewayResponse.data?.ewayBillNumber;
      }

      set({
        creating: false,
        activeOrderId: orderId,
        estimatedPrice: response.data.estimated_price,
        dispatchMode: response.data.dispatch_mode,
        generatedEwayBillNumber: ewayBillNumber,
        error: undefined
      });
    } catch (error: unknown) {
      set({
        creating: false,
        error: errorMessage(error, 'Unable to create booking')
      });
      throw error;
    }
  },
  async refreshOrder() {
    const orderId = get().activeOrderId;
    if (!orderId) {
      return null;
    }

    const response = await api.get(`/orders/${orderId}`);
    const eway = response.data?.ewayBillNumber as string | undefined;

    if (eway) {
      set({ generatedEwayBillNumber: eway });
    }

    return response.data;
  },
  async refreshTimeline() {
    const orderId = get().activeOrderId;
    if (!orderId) {
      return null;
    }

    const response = await api.get(`/orders/${orderId}/timeline`);
    return response.data;
  },
  async refreshLocationHistory() {
    const orderId = get().activeOrderId;
    if (!orderId) {
      return null;
    }

    const response = await api.get(`/orders/${orderId}/location-history`);
    return response.data;
  }
}));
