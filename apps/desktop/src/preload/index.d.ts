import type { HarnessAPI } from "./api";

declare global {
  interface Window {
    harness: HarnessAPI;
  }
}

export {};
