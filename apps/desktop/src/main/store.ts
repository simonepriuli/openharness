import Store from "electron-store";
import type { AppTheme } from "../preload/api.js";

export type { AppTheme };

interface AppStoreSchema {
  lastCwd?: string;
  recentProjectCwds?: string[];
  /** Projects removed from the sidebar; filtered from harness project lists until reopened. */
  removedProjectCwds?: string[];
  theme?: AppTheme;
  /** When true, Pi uses ~/.pi/agent instead of app userData. */
  useGlobalPiConfig?: boolean;
  /** Default model reference used by swarm_dispatch workers. */
  swarmDefaultModel?: string;
  /** Slot ids shown in the chat model selector; empty means all curated slots. */
  chatVisibleModels?: string[];
  /** Model used by the AI title generator (OpenRouter model id, e.g. "google/gemma-4-31b-it:free"). */
  titleGenerationModel?: string;
  /** App version from the last successful model catalog snapshot. */
  lastSeenAppVersion?: string;
  /** Provider/model refs from the last successful model catalog snapshot. */
  lastKnownModelRefs?: string[];
  /** App version for which the new-models notice was dismissed. */
  dismissedNewModelsForVersion?: string;
  /** Last known OpenRouter account credits (persisted to avoid loading state). */
  lastKnownCredits?: {
    status: string;
    totalCredits?: number;
    totalUsage?: number;
    creditsRemaining?: number;
    monthlySpent?: number;
    message?: string;
  };
}

export const appStore = new Store<AppStoreSchema>({
  name: "openharness",
  defaults: {},
});
