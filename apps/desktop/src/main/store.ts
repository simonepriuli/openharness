import Store from "electron-store";

interface AppStoreSchema {
  lastCwd?: string;
  recentProjectCwds?: string[];
}

export const appStore = new Store<AppStoreSchema>({
  name: "openharness",
  defaults: {},
});
