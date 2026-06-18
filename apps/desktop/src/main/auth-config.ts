import { app } from "electron";

const DEV_API_URL = "http://localhost:3001";
const PRODUCTION_API_URL = "https://openharness-api.vercel.app";
export const ELECTRON_AUTH_SCHEME = "com.openharness.desktop";

export function getApiBaseUrl(): string {
  const override = process.env.OPENHARNESS_API_URL?.trim();
  if (override) {
    return override;
  }

  return app.isPackaged ? PRODUCTION_API_URL : DEV_API_URL;
}

export function getAuthBaseUrl(): string {
  return `${getApiBaseUrl().replace(/\/$/, "")}/api/auth`;
}
