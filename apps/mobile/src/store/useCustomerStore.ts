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

const ONGOING_ORDER_STATUSES = ['CREATED', 'MATCHING', 'ASSIGNED', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT'] as const;
export function isOngoingOrderStatus(status?: string) {
  return Boolean(status && ONGOING_ORDER_STATUSES.includes(status as (typeof ONGOING_ORDER_STATUSES)[number]));
}
export function isTerminalOrderStatus(status?: string) {
  return status === 'CANCELLED' || status === 'DELIVERED';
}

export interface RoutePoint {
  address: string;
  lat: number;
  lng: number;
}

export type PaymentMethod =
  | 'UPI_SCAN_PAY'
  | 'DRIVER_UPI_DIRECT'
  | 'CASH';

export type CustomerWalletMethodType = 'UPI_ID';

export interface CustomerWalletMethod {
  id: string;
  type: CustomerWalletMethodType;
  label: string;
  upiId?: string;
  isDefault: boolean;
}

const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/i;

function walletTypeToPaymentMethod(_type: CustomerWalletMethodType): PaymentMethod {
  return 'UPI_SCAN_PAY';
}

interface CustomerState {
  activeOrderId?: string;
  activeOrderStatus?: string;
  dismissedOrderId?: string;
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
  walletMethods: CustomerWalletMethod[];
  defaultWalletMethodId?: string;
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
  addWalletMethod: (input: {
    type: CustomerWalletMethodType;
    label?: string;
    upiId?: string;
    setAsDefault?: boolean;
  }) => void;
  setDefaultWalletMethod: (methodId: string) => void;
  removeWalletMethod: (methodId: string) => void;
  fetchQuotes: (input?: BookingEstimateInput) => Promise<void>;
  fetchInsuranceQuotes: () => Promise<void>;
  selectVehicle: (vehicleType: BookingInput['vehicleType']) => void;
  createBooking: (input: BookingInput) => Promise<void>;
  syncActiveOrder: () => Promise<any>;
  refreshOrder: () => Promise<any>;
  refreshTimeline: () => Promise<any>;
  refreshLocationHistory: () => Promise<any>;
  dismissActiveOrder: () => void;
  setActiveOrder: (orderId: string, status?: string) => void;
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
  activeOrderStatus: undefined,
  dismissedOrderId: undefined,
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
  paymentMethod: 'CASH',
  walletMethods: [],
  defaultWalletMethodId: undefined,
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
  addWalletMethod(input) {
    set((state) => {
      const normalizedUpi = input.upiId?.trim().toLowerCase();
      const normalizedLabel = input.label?.trim();

      if (!normalizedUpi || !UPI_PATTERN.test(normalizedUpi)) {
        return state;
      }

      const shouldSetDefault = Boolean(input.setAsDefault) || state.walletMethods.length === 0;
      const nextId = `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const nextMethod: CustomerWalletMethod = {
        id: nextId,
        type: input.type,
        label: normalizedLabel || `UPI ${normalizedUpi}`,
        upiId: normalizedUpi,
        isDefault: shouldSetDefault
      };

      const nextWalletMethods = shouldSetDefault
        ? [
            ...state.walletMethods.map((method) => ({
              ...method,
              isDefault: false
            })),
            nextMethod
          ]
        : [...state.walletMethods, nextMethod];

      return {
        walletMethods: nextWalletMethods,
        defaultWalletMethodId: shouldSetDefault ? nextMethod.id : state.defaultWalletMethodId,
        paymentMethod: shouldSetDefault
          ? walletTypeToPaymentMethod(nextMethod.type)
          : state.paymentMethod
      };
    });
  },
  setDefaultWalletMethod(methodId) {
    set((state) => {
      const target = state.walletMethods.find((method) => method.id === methodId);
      if (!target) {
        return state;
      }

      return {
        walletMethods: state.walletMethods.map((method) => ({
          ...method,
          isDefault: method.id === methodId
        })),
        defaultWalletMethodId: methodId,
        paymentMethod: walletTypeToPaymentMethod(target.type)
      };
    });
  },
  removeWalletMethod(methodId) {
    set((state) => {
      const remaining = state.walletMethods.filter((method) => method.id !== methodId);
      if (remaining.length === state.walletMethods.length) {
        return state;
      }

      const removedWasDefault = state.defaultWalletMethodId === methodId;
      const fallbackDefault = removedWasDefault
        ? remaining[0]
        : remaining.find((method) => method.id === state.defaultWalletMethodId) ?? remaining[0];

      return {
        walletMethods: remaining.map((method) => ({
          ...method,
          isDefault: fallbackDefault ? method.id === fallbackDefault.id : false
        })),
        defaultWalletMethodId: fallbackDefault?.id,
        paymentMethod: fallbackDefault
          ? walletTypeToPaymentMethod(fallbackDefault.type)
          : 'CASH'
      };
    });
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
        activeOrderStatus: String(response.data.order_status ?? 'MATCHING'),
        dismissedOrderId: undefined,
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
    const status = response.data?.status as string | undefined;

    if (status === 'CANCELLED') {
      set({
        generatedEwayBillNumber: eway,
        dismissedOrderId: orderId,
        activeOrderId: undefined,
        activeOrderStatus: undefined
      });
      return response.data;
    }

    set({
      generatedEwayBillNumber: eway,
      activeOrderStatus: status
    });

    return response.data;
  },
  async syncActiveOrder() {
    const user = useSessionStore.getState().user;
    if (!user?.id) {
      return null;
    }

    const response = await api.get('/orders', {
      params: {
        customerId: user.id
      }
    });

    const orders = Array.isArray(response.data) ? response.data : [];
    const ongoing = orders.find((entry) => isOngoingOrderStatus(String(entry?.status ?? '')));

    if (!ongoing) {
      set({
        activeOrderId: undefined,
        activeOrderStatus: undefined
      });
      return null;
    }

    set({
      activeOrderId: String(ongoing.id),
      activeOrderStatus: String(ongoing.status),
      estimatedPrice: Number(ongoing.finalPrice ?? ongoing.estimatedPrice ?? get().estimatedPrice ?? 0)
    });

    return ongoing;
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
  },
  dismissActiveOrder() {
    const currentOrderId = get().activeOrderId;
    set({
      dismissedOrderId: currentOrderId,
      activeOrderId: undefined,
      activeOrderStatus: undefined
    });
  },
  setActiveOrder(orderId, status) {
    set({
      activeOrderId: orderId,
      activeOrderStatus: status
    });
  }
}));
