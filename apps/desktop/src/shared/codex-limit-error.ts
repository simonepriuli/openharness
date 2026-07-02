export type CodexLimitErrorBody = {
  code?: string;
  type?: string;
  message?: string;
  plan_type?: string;
  resets_at?: number;
  resets_in_seconds?: number;
};

export function formatCodexResetDelay(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  const mins = Math.round(seconds / 60);
  if (mins < 60) {
    return ` Try again in ~${mins} min.`;
  }
  const hours = Math.round(mins / 60);
  if (hours < 24) {
    return ` Try again in ~${hours} hour${hours === 1 ? "" : "s"}.`;
  }
  const days = Math.round(hours / 24);
  return ` Try again in ~${days} day${days === 1 ? "" : "s"}.`;
}

function getCodexResetDelaySeconds(err: CodexLimitErrorBody): number | undefined {
  if (typeof err.resets_in_seconds === "number" && Number.isFinite(err.resets_in_seconds)) {
    return Math.max(0, err.resets_in_seconds);
  }
  if (typeof err.resets_at === "number" && Number.isFinite(err.resets_at)) {
    return Math.max(0, err.resets_at - Date.now() / 1000);
  }
  return undefined;
}

function isCodexUsageLimitError(code: string, statusCode?: number): boolean {
  if (/usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code)) {
    return true;
  }
  return statusCode === 429;
}

export function formatCodexLimitError(
  err: CodexLimitErrorBody,
  statusCode?: number,
): string | undefined {
  const code = err.code || err.type || "";
  if (!isCodexUsageLimitError(code, statusCode)) {
    return undefined;
  }
  const plan = err.plan_type ? ` (${err.plan_type.toLowerCase()} plan)` : "";
  const when = formatCodexResetDelay(getCodexResetDelaySeconds(err));
  return `You have hit your ChatGPT usage limit${plan}.${when}`.trim();
}

/** Parse friendly usage-limit text from pi output or legacy raw Codex JSON errors. */
export function parseCodexUsageLimitMessage(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  if (/hit your ChatGPT usage limit/i.test(trimmed)) {
    return trimmed;
  }

  const codexPrefix = /^Codex error:\s*(\{[\s\S]+\})\s*$/;
  const match = trimmed.match(codexPrefix);
  if (!match?.[1]) return undefined;

  try {
    const parsed = JSON.parse(match[1]) as {
      error?: CodexLimitErrorBody;
      status_code?: number;
    };
    const err = parsed.error;
    if (!err) return undefined;
    return formatCodexLimitError(err, parsed.status_code);
  } catch {
    return undefined;
  }
}
