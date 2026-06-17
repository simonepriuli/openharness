import {
  formatHarnessError,
  MISSING_API_KEY_MARKER,
  type HarnessErrorDisplay,
} from "../../../shared/harness-errors";

export type { HarnessErrorDisplay };

export function toHarnessErrorDisplay(
  raw: string | null | undefined,
  canSendMessages?: boolean,
): HarnessErrorDisplay | null {
  if (!raw?.trim()) return null;
  return formatHarnessError(raw, { canSendMessages });
}

/** Notice above the composer: provider setup until configured, else runtime error. */
export function getActiveChatNotice(options: {
  projectOpen: boolean;
  canSendMessages?: boolean;
  runtimeError?: string | null;
}): HarnessErrorDisplay | null {
  if (options.projectOpen && options.canSendMessages === false) {
    return formatHarnessError(MISSING_API_KEY_MARKER);
  }
  return toHarnessErrorDisplay(options.runtimeError, options.canSendMessages);
}
