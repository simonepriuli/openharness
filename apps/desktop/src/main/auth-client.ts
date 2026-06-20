import type { BrowserWindow } from "electron";
import { app, protocol, shell } from "electron";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { createAuthClient } from "better-auth/client";
import { ELECTRON_AUTH_SCHEME, getAuthBaseUrl } from "./auth-config.js";
import { startAuthLoopback, stopAuthLoopbackServer } from "./auth-loopback.js";

type AuthClientWithElectron = ReturnType<typeof createAuthClient> & {
  $fetch: ReturnType<typeof createAuthClient>["$fetch"];
  getCookie: () => string;
  setupMain: (cfg?: {
    getWindow?: () => BrowserWindow | null;
    csp?: boolean;
    bridges?: boolean;
    scheme?: boolean;
  }) => void;
  requestAuth: (options?: { provider?: string }) => Promise<void>;
  authenticate: (data: { token: string }) => Promise<void>;
};

let authClient: AuthClientWithElectron | null = null;
let protocolSetupDone = false;

function getAuthClient(): AuthClientWithElectron {
  if (authClient) {
    return authClient;
  }

  const authBaseUrl = getAuthBaseUrl();
  const electronPlugin = electronClient({
    signInURL: `${authBaseUrl}/sign-in`,
    protocol: { scheme: ELECTRON_AUTH_SCHEME },
    storage: storage(),
  }) as BetterAuthClientPlugin;

  authClient = createAuthClient({
    baseURL: authBaseUrl,
    fetchOptions: {
      timeout: 5_000,
    },
    plugins: [electronPlugin],
  }) as unknown as AuthClientWithElectron;

  return authClient;
}

const AUTH_CALLBACK_PATH = "/auth/callback";

/**
 * electron-vite launches `electron .` — the protocol handler must receive the
 * package root (where package.json lives), not out/main/index.js.
 */
function getDevProtocolAppPath(): string {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const argvEntry = process.argv[1];

  if (typeof argvEntry === "string" && argvEntry !== "." && argvEntry.length > 0) {
    return resolve(argvEntry);
  }

  return packageRoot;
}

function extractAuthToken(url: string): string | null {
  if (!url.startsWith(`${ELECTRON_AUTH_SCHEME}:`)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.pathname !== AUTH_CALLBACK_PATH) {
      return null;
    }

    const queryToken = parsed.searchParams.get("token");
    if (queryToken) {
      return decodeURIComponent(queryToken);
    }
  } catch {
    return null;
  }

  const hashPrefix = "#token=";
  const hashIndex = url.indexOf(hashPrefix);
  if (hashIndex === -1) {
    return null;
  }

  return decodeURIComponent(url.slice(hashIndex + hashPrefix.length));
}

function focusWindow(getWindow: () => BrowserWindow | null): void {
  const win = getWindow();
  if (!win) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.focus();
}

/**
 * @better-auth/electron registers the protocol with `resolve(process.argv[1])`.
 * electron-vite dev passes "." as argv[1], so macOS launches a bare Electron
 * shell instead of OpenHarness. Register the handler ourselves with the main
 * entry path and wire deep links to `authenticate`.
 */
function registerAuthProtocolHandler(getWindow: () => BrowserWindow | null): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ELECTRON_AUTH_SCHEME,
      privileges: {
        standard: false,
        secure: true,
      },
    },
  ]);

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  if (!app.isPackaged) {
    // Clear stale dev registrations (e.g. from earlier runs with the wrong path).
    app.removeAsDefaultProtocolClient(ELECTRON_AUTH_SCHEME);
  }

  const devAppPath = getDevProtocolAppPath();
  const registered = app.isPackaged
    ? app.setAsDefaultProtocolClient(ELECTRON_AUTH_SCHEME)
    : app.setAsDefaultProtocolClient(ELECTRON_AUTH_SCHEME, process.execPath, [devAppPath]);

  if (!registered) {
    console.warn(
      `[auth] Failed to register ${ELECTRON_AUTH_SCHEME} handler. ` +
        `execPath=${process.execPath} appPath=${devAppPath}`,
    );
  } else if (!app.isPackaged) {
    console.info(
      `[auth] Registered ${ELECTRON_AUTH_SCHEME} → ${process.execPath} ${devAppPath}`,
    );
  }

  let pendingDeepLink: string | null = null;

  const handleAuthDeepLink = async (url: string): Promise<void> => {
    const token = extractAuthToken(url);
    if (!token) {
      return;
    }

    focusWindow(getWindow);
    await getAuthClient().authenticate({ token });
  };

  const queueAuthDeepLink = (url: string): void => {
    if (app.isReady()) {
      void handleAuthDeepLink(url);
      return;
    }

    pendingDeepLink = url;
  };

  app.on("open-url", (event, url) => {
    event.preventDefault();
    queueAuthDeepLink(url);
  });

  app.on("second-instance", (_event, commandLine) => {
    focusWindow(getWindow);

    const deepLink = commandLine.find((arg) => arg.startsWith(`${ELECTRON_AUTH_SCHEME}:`));
    if (deepLink) {
      queueAuthDeepLink(deepLink);
    }
  });

  app.whenReady().then(() => {
    if (pendingDeepLink) {
      const url = pendingDeepLink;
      pendingDeepLink = null;
      void handleAuthDeepLink(url);
    }
  });
}

/** Must run before `app.ready` (custom protocol registration). */
export function setupAuthProtocol(getWindow: () => BrowserWindow | null): void {
  if (protocolSetupDone) {
    return;
  }

  registerAuthProtocolHandler(getWindow);

  const client = getAuthClient();
  client.setupMain({
    getWindow,
    bridges: true,
    scheme: false,
    csp: true,
  });

  protocolSetupDone = true;
}

/** Kept for call-site compatibility; IPC bridges are registered in setupMain(). */
export function registerAuthIpc(): void {}

/**
 * Start browser sign-in via a localhost loopback callback. This avoids relying on
 * custom URL schemes, which often drop the token fragment on macOS.
 */
export async function requestElectronAuth(options?: { provider?: string }): Promise<void> {
  const client = getAuthClient();
  const loopbackUrl = startAuthLoopback(async (token) => {
    await client.authenticate({ token });
  });

  const originalOpenExternal = shell.openExternal.bind(shell);
  shell.openExternal = async (url, openOptions) => {
    shell.openExternal = originalOpenExternal;
    try {
      const signInUrl = new URL(url);
      signInUrl.searchParams.set("electron_loopback", loopbackUrl);
      return await originalOpenExternal(signInUrl.toString(), openOptions);
    } catch {
      return await originalOpenExternal(url, openOptions);
    }
  };

  try {
    await client.requestAuth(options);
  } finally {
    shell.openExternal = originalOpenExternal;
  }
}

app.on("before-quit", () => {
  stopAuthLoopbackServer();
});

export { getAuthClient };
