import { createHmac, timingSafeEqual } from "node:crypto";

const STALE_WINDOW_MS = 60 * 1000;

export type LinearWebhookAuthFailure =
  | "missing_signature"
  | "invalid_signature"
  | "stale_webhook";

export function resolveLinearWebhookSecret(options: {
  envSecret: string | null;
  payloadWebhookId: string | null;
  installation: {
    webhookId: string | null;
    webhookSecret: string | null;
  } | null;
}): string | null {
  const installation = options.installation;
  if (
    installation?.webhookSecret &&
    options.payloadWebhookId &&
    installation.webhookId === options.payloadWebhookId
  ) {
    return installation.webhookSecret;
  }

  // OAuth app webhooks (configured in Linear app settings) use this global secret.
  if (options.envSecret) {
    return options.envSecret;
  }

  return installation?.webhookSecret ?? null;
}

export function normalizeLinearWebhookTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
  }
  return null;
}

export function verifyLinearWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

export function validateLinearWebhookAuth(options: {
  rawBody: string;
  signatureHeader: string | undefined;
  webhookTimestamp: unknown;
  secret: string | null;
  nowMs?: number;
}): LinearWebhookAuthFailure | null {
  const now = options.nowMs ?? Date.now();

  if (options.secret) {
    const signature = options.signatureHeader?.trim();
    if (!signature) {
      return "missing_signature";
    }
    if (!verifyLinearWebhookSignature(options.rawBody, signature, options.secret)) {
      return "invalid_signature";
    }
  }

  const timestampMs = normalizeLinearWebhookTimestamp(options.webhookTimestamp);
  if (timestampMs !== null && Math.abs(now - timestampMs) > STALE_WINDOW_MS) {
    return "stale_webhook";
  }

  return null;
}
