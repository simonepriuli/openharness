import { app, type BrowserWindow } from "electron";
import type { HarnessModelInfo, NewModelsNoticePayload } from "../preload/api.js";
import { piSessionManager } from "./pi-service.js";
import { appStore } from "./store.js";

const MODEL_FETCH_RETRY_MS = 250;
const MODEL_FETCH_MAX_ATTEMPTS = 3;

export function modelRef(model: HarnessModelInfo): string {
  return `${model.provider}/${model.id}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchAvailableModelsWithRetry(): Promise<HarnessModelInfo[]> {
  for (let attempt = 0; attempt < MODEL_FETCH_MAX_ATTEMPTS; attempt += 1) {
    const models = await piSessionManager.getAvailableModels();
    if (models.length > 0) {
      return models;
    }
    if (attempt < MODEL_FETCH_MAX_ATTEMPTS - 1) {
      await sleep(MODEL_FETCH_RETRY_MS);
    }
  }
  return [];
}

export function dismissNewModelsNotice(version: string): void {
  appStore.set("dismissedNewModelsForVersion", version);
}

export async function checkForNewModelsAfterUpdate(win: BrowserWindow): Promise<void> {
  const currentVersion = app.getVersion();
  const previousVersion = appStore.get("lastSeenAppVersion");
  const previousRefs = appStore.get("lastKnownModelRefs") ?? [];
  const dismissedVersion = appStore.get("dismissedNewModelsForVersion");

  const models = await fetchAvailableModelsWithRetry();
  if (models.length === 0) {
    return;
  }

  const currentRefs = models.map(modelRef);
  const previousRefSet = new Set(previousRefs);
  const newModels = models.filter((model) => !previousRefSet.has(modelRef(model)));

  const shouldNotify =
    typeof previousVersion === "string" &&
    previousVersion.length > 0 &&
    currentVersion !== previousVersion &&
    newModels.length > 0 &&
    dismissedVersion !== currentVersion;

  if (shouldNotify && !win.isDestroyed()) {
    const payload: NewModelsNoticePayload = {
      version: currentVersion,
      models: newModels,
    };
    win.webContents.send("harness:new-models-available", payload);
  }

  appStore.set("lastSeenAppVersion", currentVersion);
  appStore.set("lastKnownModelRefs", currentRefs);
}
