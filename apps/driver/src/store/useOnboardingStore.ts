import { create } from 'zustand';
import type { VehicleType } from '@porter/shared';
import api from '../services/api';
import { useDriverSessionStore } from './useDriverSessionStore';

export interface DriverPaymentMethod {
  id: string;
  type: 'UPI_QR' | 'UPI_VPA';
  label?: string;
  upiId: string;
  qrImageUrl?: string;
  isPreferred: boolean;
  isActive: boolean;
}

interface OnboardingState {
  status?: string;
  fullName: string;
  phone: string;
  email: string;
  city: string;
  vehicleType: VehicleType;
  vehicleNumber: string;
  licenseNumber: string;
  aadhaarNumber: string;
  rcNumber: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  upiId: string;
  paymentMethods: DriverPaymentMethod[];
  uploadedDocs: string[];
  loading: boolean;
  error?: string;
  load: () => Promise<void>;
  updateProfile: (payload: Partial<Pick<OnboardingState, 'fullName' | 'phone' | 'email' | 'city'>>) => Promise<void>;
  updateVehicle: (payload: Partial<Pick<OnboardingState, 'vehicleType' | 'vehicleNumber' | 'licenseNumber' | 'aadhaarNumber' | 'rcNumber'>>) => Promise<void>;
  updateBank: (payload: Partial<Pick<OnboardingState, 'accountHolderName' | 'bankName' | 'accountNumber' | 'ifscCode' | 'upiId'>>) => Promise<void>;
  uploadDoc: (type: string) => Promise<void>;
  uploadPaymentMethodQr: (payload: {
    fileUri: string;
    fileName?: string;
    contentType?: string;
    upiId?: string;
    label?: string;
    isPreferred?: boolean;
  }) => Promise<void>;
  addPaymentMethod: (payload: {
    upiId: string;
    label?: string;
    isPreferred?: boolean;
  }) => Promise<void>;
  setPreferredPaymentMethod: (methodId: string) => Promise<void>;
  removePaymentMethod: (methodId: string) => Promise<void>;
  submit: () => Promise<void>;
}

const defaultState = {
  fullName: '',
  phone: '',
  email: '',
  city: '',
  vehicleType: 'MINI_TRUCK' as VehicleType,
  vehicleNumber: '',
  licenseNumber: '',
  aadhaarNumber: '',
  rcNumber: '',
  accountHolderName: '',
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  upiId: '',
  paymentMethods: [] as DriverPaymentMethod[],
  uploadedDocs: []
};

function currentUserId() {
  const userId = useDriverSessionStore.getState().user?.id;
  if (!userId) {
    throw new Error('Driver session not available');
  }
  return userId;
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }

  if ('response' in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;

    if (typeof data === 'string' && data.trim()) {
      return data;
    }

    if (typeof data === 'object' && data !== null) {
      if ('message' in data) {
        const message = (data as { message?: unknown }).message;
        if (Array.isArray(message)) {
          return message.join(', ');
        }
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }

      if ('error' in data && typeof (data as { error?: unknown }).error === 'string') {
        return (data as { error: string }).error;
      }
    }
  }

  if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }

  return fallback;
}

function normalizePaymentMethods(input: unknown): DriverPaymentMethod[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const candidate = entry as Record<string, unknown>;
      const id = typeof candidate.id === 'string' ? candidate.id : '';
      const upiId = typeof candidate.upiId === 'string' ? candidate.upiId : '';
      if (!id || !upiId) {
        return null;
      }

      return {
        id,
        type: (typeof candidate.type === 'string' ? candidate.type : 'UPI_VPA') as 'UPI_QR' | 'UPI_VPA',
        label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : undefined,
        upiId,
        qrImageUrl:
          typeof candidate.qrImageUrl === 'string' && candidate.qrImageUrl.trim()
            ? candidate.qrImageUrl.trim()
            : undefined,
        isPreferred: Boolean(candidate.isPreferred),
        isActive: Boolean(candidate.isActive ?? true)
      } satisfies DriverPaymentMethod;
    })
    .filter(Boolean) as DriverPaymentMethod[];
}

function buildFileNameFromUri(uri: string, fallbackExtension = 'jpg') {
  const raw = uri.split('/').pop() ?? '';
  if (!raw || !raw.includes('.')) {
    return `qr-${Date.now()}.${fallbackExtension}`;
  }
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...defaultState,
  loading: false,
  async load() {
    const userId = currentUserId();
    set({ loading: true, error: undefined });

    try {
      const [onboardingResponse, kycResponse] = await Promise.all([
        api.get('/driver-onboarding/me', { params: { userId } }),
        api.get('/kyc/status/me', { params: { userId } })
      ]);

      const onboarding = onboardingResponse.data as Record<string, unknown>;
      const docs = (kycResponse.data?.documents ?? []) as Array<{ type: string }>;

      set({
        loading: false,
        status: String(onboarding.status ?? 'NOT_STARTED'),
        fullName: String(onboarding.fullName ?? ''),
        phone: String(onboarding.phone ?? ''),
        email: String(onboarding.email ?? ''),
        city: String(onboarding.city ?? ''),
        vehicleType: (String(onboarding.vehicleType ?? 'MINI_TRUCK') as VehicleType),
        vehicleNumber: String(onboarding.vehicleNumber ?? ''),
        licenseNumber: String(onboarding.licenseNumber ?? ''),
        aadhaarNumber: String(onboarding.aadhaarNumber ?? ''),
        rcNumber: String(onboarding.rcNumber ?? ''),
        accountHolderName: String(onboarding.accountHolderName ?? ''),
        bankName: String(onboarding.bankName ?? ''),
        accountNumber: String(onboarding.accountNumber ?? ''),
        ifscCode: String(onboarding.ifscCode ?? ''),
        upiId: String(onboarding.upiId ?? ''),
        paymentMethods: normalizePaymentMethods(onboarding.paymentMethods),
        uploadedDocs: docs.map((doc) => doc.type),
        error: undefined
      });
    } catch (error: unknown) {
      set({
        loading: false,
        error:
          typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message?: unknown }).message ?? 'Unable to load onboarding state')
            : 'Unable to load onboarding state'
      });
    }
  },
  async updateProfile(payload) {
    const userId = currentUserId();
    const next = { ...get(), ...payload };

    set({ loading: true, error: undefined });

    try {
      await api.post('/driver-onboarding/profile', {
        userId,
        fullName: next.fullName,
        phone: next.phone,
        email: next.email,
        city: next.city
      });

      set({ ...payload, loading: false, error: undefined });
    } catch (error: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(error, 'Unable to save profile details')
      });
      throw error;
    }
  },
  async updateVehicle(payload) {
    const userId = currentUserId();
    const next = { ...get(), ...payload };

    set({ loading: true, error: undefined });

    try {
      await api.post('/driver-onboarding/vehicle', {
        userId,
        vehicleType: next.vehicleType,
        vehicleNumber: next.vehicleNumber,
        licenseNumber: next.licenseNumber,
        aadhaarNumber: next.aadhaarNumber,
        rcNumber: next.rcNumber
      });

      set({ ...payload, loading: false, error: undefined });
    } catch (error: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(error, 'Unable to save vehicle details')
      });
      throw error;
    }
  },
  async updateBank(payload) {
    const userId = currentUserId();
    const next = { ...get(), ...payload };

    set({ loading: true, error: undefined });

    try {
      await api.post('/driver-onboarding/bank', {
        userId,
        accountHolderName: next.accountHolderName,
        bankName: next.bankName,
        accountNumber: next.accountNumber,
        ifscCode: next.ifscCode,
        upiId: next.upiId
      });

      const methodsResponse = await api.get('/driver-onboarding/payment-methods', {
        params: { userId }
      });

      set({
        ...payload,
        paymentMethods: normalizePaymentMethods(methodsResponse.data),
        loading: false,
        error: undefined
      });
    } catch (error: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(error, 'Unable to save payout details')
      });
      throw error;
    }
  },
  async uploadDoc(type) {
    const userId = currentUserId();
    set({ loading: true, error: undefined });

    try {
      const upload = await api.post('/kyc/upload-url', {
        userId,
        type,
        fileName: `${type.toLowerCase()}.jpg`,
        contentType: 'image/jpeg'
      });

      await api.post('/kyc/documents', {
        userId,
        type,
        fileKey: upload.data.fileKey,
        fileUrl: upload.data.fileUrl,
        mimeType: 'image/jpeg',
        fileSizeBytes: 123456
      });

      set((state) => ({
        uploadedDocs: state.uploadedDocs.includes(type)
          ? state.uploadedDocs
          : [...state.uploadedDocs, type],
        loading: false
      }));

      await get().load();
    } catch (error: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(error, 'Document upload failed')
      });
      throw error;
    }
  },
  async uploadPaymentMethodQr(payload) {
    const userId = currentUserId();
    const storeUpiId = get().upiId;
    const normalizedUpi = (payload.upiId ?? storeUpiId).trim().toLowerCase();
    const upiPattern = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/i;

    if (!normalizedUpi || !upiPattern.test(normalizedUpi)) {
      throw new Error('Set a valid UPI ID before uploading QR code.');
    }

    set({ loading: true, error: undefined });

    try {
      const fileName = payload.fileName?.trim() || buildFileNameFromUri(payload.fileUri, 'jpg');
      const requestedContentType = payload.contentType?.trim() || 'image/jpeg';
      const upload = await api.post('/driver-onboarding/payment-methods/upload-url', {
        userId,
        fileName,
        contentType: requestedContentType
      });

      const uploadUrl = String(upload.data?.uploadUrl ?? '');
      const fileUrl = String(upload.data?.fileUrl ?? '');
      const resolvedContentType = String(upload.data?.contentType ?? requestedContentType);

      if (!fileUrl) {
        throw new Error('Upload URL unavailable');
      }

      if (uploadUrl && !uploadUrl.startsWith('mock://')) {
        const fileResponse = await fetch(payload.fileUri);
        const blob = await fileResponse.blob();
        const putResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': resolvedContentType
          },
          body: blob
        });

        if (!putResponse.ok) {
          throw new Error('Could not upload QR image');
        }
      }

      await api.post('/driver-onboarding/payment-methods', {
        userId,
        type: 'UPI_QR',
        label: payload.label?.trim() || undefined,
        upiId: normalizedUpi,
        qrImageUrl: fileUrl,
        isPreferred: payload.isPreferred
      });

      await get().load();
      set({ loading: false, error: undefined });
    } catch (error: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(error, 'QR upload failed')
      });
      throw error;
    }
  },
  async addPaymentMethod(payload) {
    const userId = currentUserId();
    const normalizedUpi = payload.upiId.trim().toLowerCase();
    const upiPattern = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/i;

    if (!normalizedUpi || !upiPattern.test(normalizedUpi)) {
      throw new Error('Set a valid UPI ID (example: name@bank).');
    }

    set({ loading: true, error: undefined });

    try {
      await api.post('/driver-onboarding/payment-methods', {
        userId,
        type: 'UPI_VPA',
        upiId: normalizedUpi,
        label: payload.label?.trim() || undefined,
        isPreferred: payload.isPreferred
      });

      await get().load();
    } catch (error: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(error, 'Could not add payment method')
      });
      throw error;
    }
  },
  async setPreferredPaymentMethod(methodId) {
    const userId = currentUserId();
    set({ loading: true, error: undefined });

    try {
      await api.post(`/driver-onboarding/payment-methods/${methodId}/preferred`, {
        userId
      });
      await get().load();
      set({ loading: false, error: undefined });
    } catch (error: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(error, 'Could not set preferred payment method')
      });
      throw error;
    }
  },
  async removePaymentMethod(methodId) {
    const userId = currentUserId();
    set({ loading: true, error: undefined });

    try {
      await api.delete(`/driver-onboarding/payment-methods/${methodId}`, {
        params: { userId }
      });
      await get().load();
      set({ loading: false, error: undefined });
    } catch (error: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(error, 'Could not remove payment method')
      });
      throw error;
    }
  },
  async submit() {
    const userId = currentUserId();
    set({ loading: true, error: undefined });

    try {
      await api.post('/driver-onboarding/submit', { userId });
      await api.post('/kyc/verify/provider', { userId });

      await useDriverSessionStore.getState().refreshOnboardingStatus();
      await get().load();
      set({ loading: false });
    } catch (error: unknown) {
      set({
        loading: false,
        error: extractErrorMessage(error, 'Unable to submit onboarding')
      });
      throw error;
    }
  }
}));
