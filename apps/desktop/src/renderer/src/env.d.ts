/// <reference types="vite/client" />

import type { HarnessAPI } from "../../preload/api";
import type { AuthUser } from "./auth";

interface AuthErrorContext {
  message?: string;
  status: number;
  statusText: string;
  path: string;
}

declare global {
  interface Window {
    harness: HarnessAPI;
    getUser: () => Promise<AuthUser | null>;
    requestAuth: (options?: { provider?: string }) => Promise<void>;
    signOut: () => Promise<void>;
    onAuthenticated: (callback: (user: AuthUser) => void) => () => void;
    onUserUpdated: (callback: (user: AuthUser | null) => void) => () => void;
    onAuthError: (callback: (context: AuthErrorContext) => void) => () => void;
  }
}

export {};
