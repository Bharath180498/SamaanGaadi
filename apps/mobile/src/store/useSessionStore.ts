import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { setAuthToken } from '../services/api';
import { unregisterCustomerPushToken } from '../services/pushNotifications';
import type { SessionUser } from '../types';

type Role = SessionUser['role'];

interface SessionState {
  token?: string;
  user?: SessionUser;
  role?: Role;
  loading: boolean;
  hydrated: boolean;
  error?: string;
  markHydrated: () => void;
  login: (role: Role) => Promise<void>;
  bootstrapCustomerSession: () => Promise<void>;
  logout: () => void;
}

const roleProfiles: Record<Role, { name: string; phone: string }> = {
  CUSTOMER: { name: 'Customer Demo', phone: '+919000000001' },
  DRIVER: { name: 'Driver Demo', phone: '+919000000101' },
  ADMIN: { name: 'Admin Demo', phone: '+919000000201' }
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      loading: false,
      hydrated: false,
      markHydrated() {
        set({ hydrated: true });
      },
      async bootstrapCustomerSession() {
        const state = useSessionStore.getState();
        if (state.user && state.token) {
          setAuthToken(state.token);
          return;
        }

        await state.login('CUSTOMER');
      },
      async login(role) {
        set({ loading: true, error: undefined });
        const profile = roleProfiles[role];

        try {
          const response = await api.post('/auth/mock-login', {
            name: profile.name,
            phone: profile.phone,
            role
          });

          const token = response.data.token as string;
          const user = response.data.user as SessionUser;
          setAuthToken(token);

          set({
            token,
            user,
            role,
            loading: false,
            error: undefined
          });
        } catch (error: unknown) {
          const message =
            typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
              ? (error as { message: string }).message
              : 'Login failed';

          set({
            loading: false,
            error: message
          });

          throw error;
        }
      },
      logout() {
        const customerId = useSessionStore.getState().user?.id;
        void unregisterCustomerPushToken(customerId);
        setAuthToken(undefined);
        set({ token: undefined, user: undefined, role: undefined, error: undefined });
      }
    }),
    {
      name: 'qargo-customer-session-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        role: state.role
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          setAuthToken(state.token);
        } else {
          setAuthToken(undefined);
        }
        state?.markHydrated();
      }
    }
  )
);
