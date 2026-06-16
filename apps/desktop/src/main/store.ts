import Store from "electron-store";
import type { AppTheme } from "../preload/api.js";

export type { AppTheme };

interface AppStoreSchema {
  lastCwd?: string;
  recentProjectCwds?: string[];
  theme?: AppTheme;
  /** When true, Pi uses ~/.pi/agent instead of app userData. */
  useGlobalPiConfig?: boolean;
  /** Default model reference used by swarm_dispatch workers. */
  swarmDefaultModel?: string;
  /** Slot ids shown in the chat model selector; empty means all curated slots. */
  chatVisibleModels?: string[];
  /** Model used by the AI title generator (OpenRouter model id, e.g. "google/gemma-4-31b-it:free"). */
  titleGenerationModel?: string;
}

export const appStore = new Store<AppStoreSchema>({
  name: "openharness",
  defaults: {},
});
