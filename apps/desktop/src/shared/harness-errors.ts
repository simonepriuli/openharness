export type HarnessErrorCode = "missing_api_key" | "no_session" | "generic";

/** Stored in runtime.error when no model provider is configured. */
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
const OPENAI_CODEX_PROVIDER_RE = /openai-codex/i;
const INVALID_AUTH_RE =
  /missing or invalid authorization|invalid authorization|authentication failed|401 unauthorized|incorrect api key/i;

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
  options?: { canSendMessages?: boolean },
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
          : isNoPiSessionMessage(message) && options?.canSendMessages === false
            ? "missing_api_key"
            : isNoPiSessionMessage(message)
              ? "no_session"
              : "generic";

  const unwrapped = unwrapIpcError(message);

  if (code === "missing_api_key") {
    return {
      code,
      title: "Connect a model provider",
      description:
        "Add a cloud provider API key under Settings → Cloud providers, connect a subscription under Settings → OAuth providers, or configure a local model under Settings → Local providers.",
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
    const providerMatch = unwrapped.match(/for\s+"?([^".\s]+)"?/i);
    const provider = providerMatch?.[1];
    if (provider && OPENAI_CODEX_PROVIDER_RE.test(provider)) {
      return {
        code: "missing_api_key",
        title: "Connect ChatGPT",
        description:
          "Connect your ChatGPT Plus or Pro subscription under Settings → OAuth providers, then add a Codex model under Settings → Chat.",
      };
    }
    return {
      code: "missing_api_key",
      title: "Connect a model provider",
      description: provider
        ? `No API key is set for ${provider}. Configure it in Settings → Cloud providers, OAuth providers, or Local providers.`
        : "Add a cloud provider API key under Settings → Cloud providers, connect a subscription under Settings → OAuth providers, or configure a local model under Settings → Local providers.",
    };
  }

  if (OPENAI_CODEX_PROVIDER_RE.test(unwrapped) && /\/login|oauth|authorization|not authenticated/i.test(unwrapped)) {
    return {
      code: "missing_api_key",
      title: "Connect ChatGPT",
      description:
        "Connect your ChatGPT Plus or Pro subscription under Settings → OAuth providers, then add a Codex model under Settings → Chat.",
    };
  }

  if (INVALID_AUTH_RE.test(unwrapped)) {
    return {
      code: "missing_api_key",
      title: "Local server rejected the API key",
      description:
        "Save your Cursor key in the API for Cursor app, then enable it under Settings → Local providers → API for Cursor. Otherwise add the server’s API key under Custom server.",
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
  options?: { canSendMessages?: boolean },
): HarnessErrorDisplay {
  return formatHarnessError(err, options);
}
