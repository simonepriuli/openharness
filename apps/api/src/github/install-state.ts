import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

const STATE_TTL_MS = 30 * 60 * 1000;

function signPayload(payload: string): string {
  return createHmac("sha256", env.betterAuthSecret()).update(payload).digest("base64url");
}

/** Signed state tying a GitHub App install flow to an OpenHarness user. */
export function createInstallState(userId: string): string {
  const nonce = randomUUID();
  const expiresAt = Date.now() + STATE_TTL_MS;
  const payload = `${userId}:${expiresAt}:${nonce}`;
  const signature = signPayload(payload);
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

export function verifyInstallState(state: string): { userId: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 4) return null;

    const [userId, expiresRaw, nonce, signature] = parts;
    if (!userId || !expiresRaw || !nonce || !signature) return null;

    const expiresAt = Number.parseInt(expiresRaw, 10);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

    const payload = `${userId}:${expiresRaw}:${nonce}`;
    const expected = signPayload(payload);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    return { userId };
  } catch {
    return null;
  }
}
