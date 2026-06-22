import {
  app,
  Menu,
  nativeImage,
  nativeTheme,
  Tray,
  type MenuItemConstructorOptions,
  type NativeImage,
} from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getWorkflowRunner } from "./workflow-runner.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

type ShowOrCreateMainWindow = () => void;
type OpenSettings = () => void;

let tray: Tray | null = null;
let showOrCreateMainWindow: ShowOrCreateMainWindow | null = null;
let openSettings: OpenSettings | null = null;
let themeListenerAttached = false;

function trayIconFileName(): string {
  return nativeTheme.shouldUseDarkColors ? "menubar-white.png" : "menubar-black.png";
}

function resolveTrayIconPath(): string {
  const fileName = trayIconFileName();
  const candidates = [
    join(process.resourcesPath, "tray", fileName),
    join(app.getAppPath(), "src/renderer/src/images/tray", fileName),
    join(__dirname, "../../src/renderer/src/images/tray", fileName),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`[tray] Tray icon not found (${fileName})`);
}

const TRAY_ICON_SIZE = 16;

function loadTrayIcon(): NativeImage {
  const image = nativeImage.createFromPath(resolveTrayIconPath());
  const { width, height } = image.getSize();

  if (width <= TRAY_ICON_SIZE && height <= TRAY_ICON_SIZE) {
    return image;
  }

  // macOS treats image pixels as points unless scaleFactor is set — keep to 16×16.
  return image.resize({
    width: TRAY_ICON_SIZE,
    height: TRAY_ICON_SIZE,
    quality: "best",
  });
}

function updateTrayIcon(): void {
  if (!tray) return;
  tray.setImage(loadTrayIcon());
}

function buildTrayMenu(): Menu {
  const workflowBusy = getWorkflowRunner().isBusy();
  const items: MenuItemConstructorOptions[] = [
    {
      label: "Open OpenHarness",
      click: () => showOrCreateMainWindow?.(),
    },
    {
      label: "Settings…",
      click: () => openSettings?.(),
    },
    { type: "separator" },
  ];

  if (workflowBusy) {
    items.push({
      label: "Workflow running…",
      enabled: false,
    });
    items.push({ type: "separator" });
  }

  items.push({
    label: "Quit",
    click: () => app.quit(),
  });

  return Menu.buildFromTemplate(items);
}

function showTrayMenu(): void {
  if (!tray) return;
  tray.popUpContextMenu(buildTrayMenu());
}

export function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

export function initTray(options: {
  showOrCreateMainWindow: ShowOrCreateMainWindow;
  openSettings: OpenSettings;
}): void {
  if (process.platform !== "darwin" || tray) return;

  showOrCreateMainWindow = options.showOrCreateMainWindow;
  openSettings = options.openSettings;

  tray = new Tray(loadTrayIcon());
  tray.setToolTip("OpenHarness");

  if (!themeListenerAttached) {
    nativeTheme.on("updated", () => {
      updateTrayIcon();
    });
    themeListenerAttached = true;
  }

  tray.on("click", () => {
    showTrayMenu();
  });

  tray.on("right-click", () => {
    showTrayMenu();
  });

  refreshTrayMenu();
  getWorkflowRunner().setActivityChangeListener(() => {
    refreshTrayMenu();
  });
}

export function destroyTray(): void {
  getWorkflowRunner().setActivityChangeListener(null);
  tray?.destroy();
  tray = null;
  showOrCreateMainWindow = null;
  openSettings = null;
}
