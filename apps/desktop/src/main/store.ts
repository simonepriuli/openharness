import Store from "electron-store";

interface AppStoreSchema {
  lastCwd?: string;
  recentProjectCwds?: string[];
  /** When true, Pi uses ~/.pi/agent instead of app userData. */
  useGlobalPiConfig?: boolean;
}

export const appStore = new Store<AppStoreSchema>({
  name: "openharness",
  defaults: {},
});
