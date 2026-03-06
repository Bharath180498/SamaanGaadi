import axios from 'axios';
import { NativeModules } from 'react-native';
import appConfig from '../../app.json';

const configuredApiBaseUrlRaw = (appConfig as { expo?: { extra?: { apiBaseUrl?: unknown } } }).expo
  ?.extra?.apiBaseUrl;

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(Number(part)))) {
    return false;
  }

  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
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

function resolveApiBaseUrl(): string {
  const runtimeHost = extractHostFromExpoRuntime();
  const configuredApiBaseUrl =
    typeof configuredApiBaseUrlRaw === 'string' ? configuredApiBaseUrlRaw.trim() : undefined;

  if (configuredApiBaseUrl) {
    try {
      const parsed = new URL(configuredApiBaseUrl);
      const configuredHost = parsed.hostname;

      if (
        runtimeHost &&
        configuredHost &&
        configuredHost !== runtimeHost &&
        isPrivateIpv4(configuredHost) &&
        isPrivateIpv4(runtimeHost)
      ) {
        const protocol = parsed.protocol || 'http:';
        const port = parsed.port || '3001';
        const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '/api';
        return `${protocol}//${runtimeHost}:${port}${pathname}`;
      }

      return configuredApiBaseUrl;
    } catch {
      return configuredApiBaseUrl;
    }
  }

  if (runtimeHost) {
    return `http://${runtimeHost}:3001/api`;
  }

  return 'http://localhost:3001/api';
}

export const API_BASE_URL = resolveApiBaseUrl();
export const REALTIME_BASE_URL = API_BASE_URL.replace(/\/api$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000
});

export function setAuthToken(token?: string) {
  if (!token) {
    delete api.defaults.headers.common.Authorization;
    return;
  }

  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export default api;
