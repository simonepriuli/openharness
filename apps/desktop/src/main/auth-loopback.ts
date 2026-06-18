import { createServer, type Server } from "node:http";

const DEV_LOOPBACK_PORT = 47_821;
const LOOPBACK_PATH = "/auth/callback";

let activeServer: Server | null = null;

function stopAuthLoopback(): void {
  if (activeServer) {
    activeServer.close();
    activeServer = null;
  }
}

function extractTokenFromRequest(url: string): string | null {
  try {
    const parsed = new URL(url, "http://127.0.0.1");
    if (parsed.pathname !== LOOPBACK_PATH) {
      return null;
    }

    if (parsed.hash.startsWith("#token=")) {
      return decodeURIComponent(parsed.hash.slice("#token=".length));
    }

    const queryToken = parsed.searchParams.get("token");
    return queryToken ? decodeURIComponent(queryToken) : null;
  } catch {
    return null;
  }
}

/**
 * Dev-only HTTP callback so the browser can return the auth token without relying
 * on macOS custom URL scheme handlers (which launch bare Electron in dev).
 */
export function startAuthLoopback(onToken: (token: string) => Promise<void>): string {
  stopAuthLoopback();

  const callbackUrl = `http://127.0.0.1:${DEV_LOOPBACK_PORT}${LOOPBACK_PATH}`;

  activeServer = createServer((req, res) => {
    const token = req.url ? extractTokenFromRequest(req.url) : null;

    if (!token) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    void onToken(token)
      .then(() => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<!DOCTYPE html><html><body><p>Signed in — you can close this tab and return to OpenHarness.</p></body></html>",
        );
      })
      .catch(() => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Sign-in failed");
      })
      .finally(() => {
        stopAuthLoopback();
      });
  });

  activeServer.listen(DEV_LOOPBACK_PORT, "127.0.0.1");
  return callbackUrl;
}

export function stopAuthLoopbackServer(): void {
  stopAuthLoopback();
}
