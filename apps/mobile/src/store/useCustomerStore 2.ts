import { create } from 'zustand';
import api from '../services/api';
import type { BookingInput } from '../types';
import { useSessionStore } from './useSessionStore';

interface CustomerState {
  activeOrderId?: string;
  estimatedPrice?: number;
  dispatchMode?: string;
  creating: boolean;
  createBooking: (input: BookingInput) => Promise<void>;
  refreshOrder: () => Promise<any>;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  creating: false,
  async createBooking(input) {
    const user = useSessionStore.getState().user;
    if (!user) {
      throw new Error('User not logged in');
    }

    set({ creating: true });

    const response = await api.post('/orders', {
      customerId: user.id,
      ...input,
      insuranceSelected: 'BASIC'
    });

    set({
      creating: false,
      activeOrderId: response.data.order_id,
      estimatedPrice: response.data.estimated_price,
      dispatchMode: response.data.dispatch_mode
    });
  },
  async refreshOrder() {
    const orderId = get().activeOrderId;
    if (!orderId) {
      return null;
    }

    const response = await api.get(`/orders/${orderId}`);
    return response.data;
  }
}));
