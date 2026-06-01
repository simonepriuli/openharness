export type HarnessErrorCode = "missing_api_key" | "no_session" | "generic";

/** Stored in runtime.error when the OpenRouter key is not configured. */
export const MISSING_API_KEY_MARKER = "__openharness:missing_api_key__";

export class HarnessError extends Error {
  readonly code: HarnessErrorCode;

  constructor(message: string, code: HarnessErrorCode = "generic") {
    super(message);
    this.name = "HarnessError";
    this.code = code;
  }
}

export type HarnessErrorDisplay = {
  title: string;
  description: string;
  code: HarnessErrorCode;
};

const IPC_INVOKE_RE =
  /^Error invoking remote method 'harness:[^']+':\s*(?:Error:\s*)?/i;
const NO_PI_SESSION_RE = /^No Pi session for key:/i;
const NO_API_KEY_RE = /no api key(?:\s+found)?(?:\s+for)?/i;

function unwrapIpcError(message: string): string {
  return message.replace(IPC_INVOKE_RE, "").trim();
}

function isMissingApiKeyMessage(message: string): boolean {
  return NO_API_KEY_RE.test(message);
}

function isNoPiSessionMessage(message: string): boolean {
  return NO_PI_SESSION_RE.test(message);
}

export function formatHarnessError(
  raw: unknown,
  options?: { openRouterConfigured?: boolean },
): HarnessErrorDisplay {
  const message =
    raw instanceof HarnessError
      ? raw.message
      : raw instanceof Error
        ? raw.message
        : typeof raw === "string"
          ? raw
          : String(raw);

  const code =
    raw instanceof HarnessError
      ? raw.code
      : message === MISSING_API_KEY_MARKER
        ? "missing_api_key"
        : isMissingApiKeyMessage(message)
          ? "missing_api_key"
          : isNoPiSessionMessage(message) && options?.openRouterConfigured === false
            ? "missing_api_key"
            : isNoPiSessionMessage(message)
              ? "no_session"
              : "generic";

  const unwrapped = unwrapIpcError(message);

  if (code === "missing_api_key") {
    return {
      code,
      title: "Connect OpenRouter",
      description: "Add an API key to send messages and choose models.",
    };
  }

  if (code === "no_session") {
    return {
      code,
      title: "Connection lost",
      description: "The agent stopped. Send your message again to reconnect.",
    };
  }

  if (isNoPiSessionMessage(unwrapped)) {
    return {
      code: "no_session",
      title: "Connection lost",
      description: "The agent stopped. Send your message again to reconnect.",
    };
  }

  if (isMissingApiKeyMessage(unwrapped)) {
    const providerMatch = unwrapped.match(/for\s+([^\s.]+)/i);
    const provider = providerMatch?.[1];
    return {
      code: "missing_api_key",
      title: "Connect OpenRouter",
      description: provider
        ? `No API key is set for ${provider}. Add one in Settings to continue.`
        : "Add an API key to send messages and choose models.",
    };
  }

  const cleaned = unwrapped
    .replace(/\s*Use \/login to[\s\S]*/i, "")
    .replace(/\s*See:\s*[\s\S]*/i, "")
    .trim();

  return {
    code: "generic",
    title: "Couldn’t complete that",
    description: cleaned || "Something went wrong. Try again.",
  };
}

export function harnessErrorToDisplay(
  err: unknown,
  options?: { openRouterConfigured?: boolean },
): HarnessErrorDisplay {
  return formatHarnessError(err, options);
}
