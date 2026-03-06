import { create } from 'zustand';
import api, { setAuthToken } from '../services/api';
import type { SessionUser } from '../types';

type Role = SessionUser['role'];

interface SessionState {
  token?: string;
  user?: SessionUser;
  role?: Role;
  loading: boolean;
  error?: string;
  login: (role: Role) => Promise<void>;
  logout: () => void;
}

const roleProfiles: Record<Role, { name: string; phone: string }> = {
  CUSTOMER: { name: 'Customer Demo', phone: '+919000000001' },
  DRIVER: { name: 'Driver Demo', phone: '+919000000101' },
  ADMIN: { name: 'Admin Demo', phone: '+919000000201' }
};

export const useSessionStore = create<SessionState>((set) => ({
  loading: false,
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
    setAuthToken(undefined);
    set({ token: undefined, user: undefined, role: undefined, error: undefined });
  }
}));
