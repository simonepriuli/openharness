const DEFAULT_API_URL = "http://localhost:3001";
export const ELECTRON_AUTH_SCHEME = "com.openharness.desktop";

export function getApiBaseUrl(): string {
  return process.env.OPENHARNESS_API_URL?.trim() || DEFAULT_API_URL;
}

export function getAuthBaseUrl(): string {
  return `${getApiBaseUrl().replace(/\/$/, "")}/api/auth`;
}
