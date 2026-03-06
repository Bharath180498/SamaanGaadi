import { create } from 'zustand';
import api from '../services/api';
import { useSessionStore } from './useSessionStore';

interface DriverEarnings {
  currency: string;
  tripCount: number;
  summary: {
    grossFare: number;
    waitingCharges: number;
    commission: number;
    netPayout: number;
  };
  recentTrips: Array<{
    tripId: string;
    orderId: string;
    fare: number;
    waitingCharge: number;
    deliveredAt?: string;
  }>;
}

interface DriverState {
  driverProfileId?: string;
  availabilityStatus?: 'ONLINE' | 'OFFLINE' | 'BUSY';
  currentJob?: any;
  nextJob?: any;
  earnings?: DriverEarnings;
  loading: boolean;
  error?: string;
  bootstrap: () => Promise<void>;
  toggleOnline: (nextStatus: 'ONLINE' | 'OFFLINE') => Promise<void>;
  refreshJobs: () => Promise<void>;
  refreshEarnings: () => Promise<void>;
  updateLocation: (lat: number, lng: number, orderId?: string) => Promise<void>;
}

export const useDriverStore = create<DriverState>((set, get) => ({
  loading: false,
  async bootstrap() {
    const session = useSessionStore.getState();
    if (!session.user) {
      return;
    }

    set({ loading: true, error: undefined });

    try {
      const usersResponse = await api.get('/users', {
        params: { role: 'DRIVER' }
      });

      const matchingUser = usersResponse.data.find((entry: any) => entry.id === session.user?.id);
      if (!matchingUser?.driverProfile?.id) {
        set({ loading: false, error: 'Driver profile not found. Seed data may be missing.' });
        return;
      }

      set({
        driverProfileId: matchingUser.driverProfile.id,
        availabilityStatus: matchingUser.driverProfile.availabilityStatus,
        loading: false,
        error: undefined
      });

      await Promise.all([get().refreshJobs(), get().refreshEarnings()]);
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'Failed to load driver profile';

      set({ loading: false, error: message });
    }
  },
  async toggleOnline(nextStatus) {
    const driverId = get().driverProfileId;
    if (!driverId) {
      return;
    }

    await api.post(`/drivers/${driverId}/availability`, {
      status: nextStatus
    });

    set({ availabilityStatus: nextStatus });
  },
  async refreshJobs() {
    const driverId = get().driverProfileId;
    if (!driverId) {
      return;
    }

    const response = await api.get(`/drivers/${driverId}/jobs`);

    set({
      currentJob: response.data.currentJob,
      nextJob: response.data.nextJob,
      availabilityStatus: response.data.currentJob ? 'BUSY' : get().availabilityStatus
    });
  },
  async refreshEarnings() {
    const driverId = get().driverProfileId;
    if (!driverId) {
      return;
    }

    const response = await api.get(`/drivers/${driverId}/earnings`);
    set({ earnings: response.data });
  },
  async updateLocation(lat, lng, orderId) {
    const driverId = get().driverProfileId;
    if (!driverId) {
      return;
    }

    await api.post('/drivers/location', {
      driverId,
      latitude: lat,
      longitude: lng,
      orderId,
      timestamp: new Date().toISOString()
    });
  }
}));
