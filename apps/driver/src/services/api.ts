import axios from 'axios';
import { NativeModules } from 'react-native';
import appConfig from '../../app.json';

const configuredApiBaseUrlRaw = (appConfig as { expo?: { extra?: { apiBaseUrl?: unknown } } }).expo
  ?.extra?.apiBaseUrl;
const configuredSupportPhoneRaw = (
  appConfig as { expo?: { extra?: { supportPhone?: unknown } } }
).expo?.extra?.supportPhone;

function normalizeConfiguredApiBaseUrl(value: string): string {
  let next = value.trim();

  if (!next) {
    return next;
  }

  if (/^https?:[^/]/i.test(next)) {
    next = next.replace(/^https?:/i, (match) => `${match}//`);
  }

  if (!/^[a-z]+:\/\//i.test(next)) {
    next = `http://${next}`;
  }

  return next;
}

function extractHostFromExpoRuntime(): string | undefined {
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;
  if (!scriptURL) {
    return undefined;
  }

  try {
    return new URL(scriptURL).hostname;
  } catch {
    return undefined;
  }
}

function resolveApiBaseUrl() {
  const runtimeHost = extractHostFromExpoRuntime();
  const configuredApiBaseUrl =
    typeof configuredApiBaseUrlRaw === 'string'
      ? normalizeConfiguredApiBaseUrl(configuredApiBaseUrlRaw)
      : undefined;

  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl;
  }

  if (runtimeHost) {
    return `http://${runtimeHost}:3001/api`;
  }

  return 'http://localhost:3001/api';
}

export const API_BASE_URL = resolveApiBaseUrl();
export const REALTIME_BASE_URL = API_BASE_URL.replace(/\/api$/, '');
export const SUPPORT_PHONE =
  typeof configuredSupportPhoneRaw === 'string' && configuredSupportPhoneRaw.trim()
    ? configuredSupportPhoneRaw.trim()
    : '9844259899';

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return '••••••';
  }
  if (digits.length <= 4) {
    return `••${digits.slice(-2)}`;
  }
  const prefix = digits.slice(0, 2);
  const suffix = digits.slice(-2);
  const hidden = '•'.repeat(Math.max(4, digits.length - 4));
  return `${prefix}${hidden}${suffix}`;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
});

export function setAuthToken(token?: string) {
  if (!token) {
    delete api.defaults.headers.common.Authorization;
    return;
  }

  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export default api;
