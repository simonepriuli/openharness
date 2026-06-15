import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from "electron";
import type { HarnessMenuAction } from "../preload/api.js";
import { checkForUpdates, isUpdaterEnabled } from "./updater.js";

const GITHUB_REPO = "https://github.com/simonepriuli/openharness";
const PI_DOCS_URL = "https://pi.dev/";
const RELEASES_URL = `${GITHUB_REPO}/releases`;

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function sendMenuAction(action: HarnessMenuAction): void {
  const window = focusedWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send("harness:menu-action", action);
}

function openExternal(url: string): void {
  void shell.openExternal(url);
}

function buildAppearanceSubmenu(): MenuItemConstructorOptions[] {
  return (["system", "light", "dark"] as const).map((theme) => ({
    label: theme[0]!.toUpperCase() + theme.slice(1),
    click: () => sendMenuAction({ type: "set-theme", theme }),
  }));
}

function buildViewSubmenu(): MenuItemConstructorOptions[] {
  return [
    {
      label: "Toggle Sidebar",
      accelerator: "CmdOrCtrl+B",
      click: () => sendMenuAction({ type: "toggle-sidebar" }),
    },
    {
      label: "Toggle Swarm Mode",
      accelerator: "CmdOrCtrl+Shift+S",
      click: () => sendMenuAction({ type: "toggle-swarm" }),
    },
    { type: "separator" },
    {
      label: "Appearance",
      submenu: buildAppearanceSubmenu(),
    },
    { type: "separator" },
    { role: "togglefullscreen" },
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
  ];
}

function buildHelpSubmenu(updaterEnabled: boolean): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    {
      label: "OpenHarness Documentation",
      click: () => openExternal(`${GITHUB_REPO}#readme`),
    },
    {
      label: "Pi Agent Documentation",
      click: () => openExternal(PI_DOCS_URL),
    },
    { type: "separator" },
  ];

  if (process.platform !== "darwin") {
    items.push({
      label: "Check for Updates…",
      enabled: updaterEnabled,
      click: () => void checkForUpdates(),
    });
    items.push({ type: "separator" });
  }

  items.push(
    {
      label: "View Release Notes…",
      click: () => openExternal(RELEASES_URL),
    },
    {
      label: "Report an Issue…",
      click: () => openExternal(`${GITHUB_REPO}/issues/new`),
    },
  );

  return items;
}

export function configureAboutPanel(): void {
  if (process.platform !== "darwin") return;
  app.setAboutPanelOptions({
    applicationName: "OpenHarness",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © OpenHarness",
    website: GITHUB_REPO,
  });
}

export function setApplicationMenu(): void {
  const isMac = process.platform === "darwin";
  const updaterEnabled = isUpdaterEnabled();

  const fileSubmenu: MenuItemConstructorOptions[] = [
    ...(!isMac
      ? [
          {
            label: "Settings…",
            accelerator: "CmdOrCtrl+,",
            click: () => sendMenuAction({ type: "open-settings" }),
          },
          { type: "separator" as const },
        ]
      : []),
    {
      label: "Open Project…",
      accelerator: "CmdOrCtrl+O",
      click: () => sendMenuAction({ type: "open-folder" }),
    },
    {
      label: "New Conversation",
      accelerator: "CmdOrCtrl+N",
      click: () => sendMenuAction({ type: "new-conversation" }),
    },
    { type: "separator" },
    isMac ? { role: "close" } : { role: "quit" },
  ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Settings…",
                accelerator: "CmdOrCtrl+,",
                click: () => sendMenuAction({ type: "open-settings" }),
              },
              {
                label: "Check for Updates…",
                enabled: updaterEnabled,
                click: () => void checkForUpdates(),
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: fileSubmenu,
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: buildViewSubmenu(),
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: buildHelpSubmenu(updaterEnabled),
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
