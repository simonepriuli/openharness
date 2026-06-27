import Store from "electron-store";
import type { AppTheme, TokenStats } from "../preload/api.js";

export type { AppTheme };

export type AppWorkMode = "coding" | "everyday";

interface AppStoreSchema {
  lastCwd?: string;
  recentProjectCwds?: string[];
  /** Projects removed from the sidebar; filtered from harness project lists until reopened. */
  removedProjectCwds?: string[];
  theme?: AppTheme;
  /** UI mode: project-grouped coding workspace vs flat everyday work chats. */
  workMode?: AppWorkMode;
  /** Default model reference used by swarm_dispatch workers. */
  swarmDefaultModel?: string;
  /** Slot ids shown in the chat model selector; empty means all curated slots. */
  chatVisibleModels?: string[];
  /** Model used by the AI title generator (provider/model ref, e.g. "openrouter/google/gemma-4-31b-it:free"). */
  titleGenerationModel?: string;
  /** Model used to summarize completed workflow runs for storage in the cloud. */
  workflowSummarizationModel?: string;
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
  /** Locally accumulated token usage across all sessions. */
  tokenUsage?: {
    monthKey: string;
    allTime: TokenStats;
    monthly: TokenStats;
    sessionSnapshots: Record<string, TokenStats>;
  };
  /** Stable id for claiming GitHub workflow runs from this desktop instance. */
  workflowRunnerInstanceId?: string;
}

export const appStore = new Store<AppStoreSchema>({
  name: "openharness",
  defaults: {},
});
