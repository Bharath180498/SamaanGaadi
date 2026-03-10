import { create } from 'zustand';
import api from '../services/api';
import { REALTIME_BASE_URL } from '../services/api';
import { io, Socket } from 'socket.io-client';
import { useDriverSessionStore } from './useDriverSessionStore';

interface DriverEarnings {
  tripCount: number;
  summary: {
    grossFare: number;
    waitingCharges: number;
    commission: number;
    subscriptionFee?: number;
    netPayout: number;
    takeHomeAfterSubscription?: number;
  };
  subscription?: {
    plan: 'GO' | 'PRO' | 'ENTERPRISE';
    status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
    monthlyFeeInr: number | null;
    trial: {
      isActive: boolean;
      endsAt: string;
      daysLeft: number;
    };
    note: string;
  };
  recentTrips: Array<{
    tripId: string;
    orderId: string;
    fare: number;
    deliveredAt?: string;
  }>;
}

interface DriverSubscriptionCatalog {
  driverId: string;
  current: {
    plan: 'GO' | 'PRO' | 'ENTERPRISE';
    status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
    monthlyFeeInr: number | null;
    trial: {
      isActive: boolean;
      endsAt: string;
      daysLeft: number;
    };
  };
  options: Array<{
    plan: 'GO' | 'PRO' | 'ENTERPRISE';
    monthlyFeeInr: number | null;
    billing: 'monthly' | 'contract';
    features: string[];
  }>;
  enterpriseRequest: {
    id: string;
    status: 'PENDING' | 'CONTACTED' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    notes?: string;
  } | null;
}

interface UpdateSubscriptionResult {
  changed: boolean;
  message: string;
  driverId: string;
  plan: 'GO' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
  trialEndsAt?: string;
  requiresSalesFollowup?: boolean;
  enterpriseRequest?: {
    id: string;
    status: 'PENDING' | 'CONTACTED' | 'APPROVED' | 'REJECTED';
    createdAt: string;
  };
}

interface DriverAppState {
  driverProfileId?: string;
  availabilityStatus?: 'ONLINE' | 'OFFLINE' | 'BUSY';
  currentJob?: any;
  nextJob?: any;
  pendingOffers: any[];
  earnings?: DriverEarnings;
  subscriptionCatalog?: DriverSubscriptionCatalog;
  loading: boolean;
  error?: string;
  bootstrap: () => Promise<void>;
  refreshJobs: () => Promise<void>;
  refreshEarnings: () => Promise<void>;
  refreshSubscriptionCatalog: () => Promise<void>;
  setSubscriptionPlan: (
    plan: 'GO' | 'PRO' | 'ENTERPRISE',
    details?: {
      contactName?: string;
      contactPhone?: string;
      city?: string;
      fleetSize?: number;
      notes?: string;
    }
  ) => Promise<UpdateSubscriptionResult>;
  setAvailability: (next: 'ONLINE' | 'OFFLINE') => Promise<void>;
  updateLocation: (lat: number, lng: number, orderId?: string) => Promise<void>;
  acceptOffer: (offerId: string) => Promise<void>;
  rejectOffer: (offerId: string) => Promise<void>;
  runTripAction: (tripId: string, endpoint: string, payload?: Record<string, unknown>) => Promise<void>;
  connectRealtime: () => void;
  disconnectRealtime: () => void;
}

function readError(error: unknown, fallback: string) {
  return typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : fallback;
}

export const useDriverAppStore = create<DriverAppState>((set, get) => ({
  loading: false,
  pendingOffers: [],
  connectRealtime() {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      return;
    }

    if (driverRealtimeSocket?.connected) {
      driverRealtimeSocket.emit('subscribe:driver', { driverId: driverProfileId });
      return;
    }

    driverRealtimeSocket = io(`${REALTIME_BASE_URL}/realtime`, {
      transports: ['websocket']
    });

    driverRealtimeSocket.on('connect', () => {
      driverRealtimeSocket?.emit('subscribe:driver', { driverId: driverProfileId });
    });

    const refresh = () => {
      void Promise.all([get().refreshJobs(), get().refreshEarnings()]);
    };

    driverRealtimeSocket.on('trip:offer:new', refresh);
    driverRealtimeSocket.on('trip:offer:expiring', refresh);
    driverRealtimeSocket.on('trip:offer:expired', refresh);
    driverRealtimeSocket.on('driver:queue-offer', refresh);
    driverRealtimeSocket.on('driver:queue-activated', refresh);
    driverRealtimeSocket.on('driver:next-job', refresh);
    driverRealtimeSocket.on('trip:customer-cancelled', refresh);
  },
  disconnectRealtime() {
    if (driverRealtimeSocket) {
      driverRealtimeSocket.disconnect();
      driverRealtimeSocket = null;
    }
  },
  async bootstrap() {
    const user = useDriverSessionStore.getState().user;
    if (!user?.id) {
      return;
    }

    set({ loading: true, error: undefined });

    try {
      const usersResponse = await api.get('/users', {
        params: {
          role: 'DRIVER'
        }
      });

      const me = (usersResponse.data as Array<any>).find((entry) => entry.id === user.id);

      if (!me?.driverProfile?.id) {
        set({
          loading: false,
          driverProfileId: undefined,
          availabilityStatus: 'OFFLINE',
          error: 'Driver profile not ready. Complete onboarding and KYC approval.'
        });
        return;
      }

      set({
        loading: false,
        driverProfileId: me.driverProfile.id,
        availabilityStatus: me.driverProfile.availabilityStatus,
        error: undefined
      });

      get().connectRealtime();

      await Promise.all([get().refreshJobs(), get().refreshEarnings(), get().refreshSubscriptionCatalog()]);
    } catch (error: unknown) {
      set({
        loading: false,
        error: readError(error, 'Unable to bootstrap driver state')
      });
    }
  },
  async refreshJobs() {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      return;
    }

    const [jobsResponse, offersResponse] = await Promise.all([
      api.get(`/drivers/${driverProfileId}/jobs`),
      api.get(`/dispatch/drivers/${driverProfileId}/offers`)
    ]);

    const response = jobsResponse;
    set({
      currentJob: response.data.currentJob,
      nextJob: response.data.nextJob,
      pendingOffers: offersResponse.data ?? response.data.pendingOffers ?? [],
      availabilityStatus: response.data.currentJob
        ? 'BUSY'
        : (response.data.availabilityStatus ??
            (get().availabilityStatus === 'OFFLINE' ? 'OFFLINE' : 'ONLINE'))
    });
  },
  async refreshEarnings() {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      return;
    }

    const response = await api.get(`/drivers/${driverProfileId}/earnings`);
    set({ earnings: response.data });
  },
  async refreshSubscriptionCatalog() {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      return;
    }

    const response = await api.get(`/drivers/${driverProfileId}/subscription`);
    set({ subscriptionCatalog: response.data });
  },
  async setSubscriptionPlan(plan, details) {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      throw new Error('Driver profile not ready yet.');
    }

    const response = await api.post<UpdateSubscriptionResult>(`/drivers/${driverProfileId}/subscription`, {
      plan,
      ...(details ?? {})
    });
    await Promise.all([get().refreshEarnings(), get().refreshSubscriptionCatalog()]);
    return response.data;
  },
  async setAvailability(next) {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      return;
    }

    await api.post(`/drivers/${driverProfileId}/availability`, { status: next });
    set({ availabilityStatus: next });
  },
  async updateLocation(lat, lng, orderId) {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      return;
    }

    await api.post('/drivers/location', {
      driverId: driverProfileId,
      latitude: lat,
      longitude: lng,
      orderId,
      timestamp: new Date().toISOString()
    });
  },
  async acceptOffer(offerId) {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      return;
    }

    await api.post(`/dispatch/offers/${offerId}/accept`, {
      driverId: driverProfileId
    });

    await get().refreshJobs();
  },
  async rejectOffer(offerId) {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      return;
    }

    await api.post(`/dispatch/offers/${offerId}/reject`, {
      driverId: driverProfileId
    });

    await get().refreshJobs();
  },
  async runTripAction(tripId, endpoint, payload) {
    const driverProfileId = get().driverProfileId;
    if (!driverProfileId) {
      return;
    }

    try {
      await api.post(`/trips/${tripId}/${endpoint}`, {
        driverId: driverProfileId,
        ...(payload ?? {})
      });

      await Promise.all([get().refreshJobs(), get().refreshEarnings()]);
    } catch (error: unknown) {
      set({
        error: readError(error, 'Failed to perform trip action')
      });
      throw error;
    }
  }
}));

let driverRealtimeSocket: Socket | null = null;
