import { getApiBaseUrl } from "./auth-config.js";

export interface AuthApiStatus {
  apiUrl: string;
  reachable: boolean;
}

export async function getAuthApiStatus(): Promise<AuthApiStatus> {
  const apiUrl = getApiBaseUrl();

  try {
    const response = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return { apiUrl, reachable: response.ok };
  } catch {
    return { apiUrl, reachable: false };
  }
}
