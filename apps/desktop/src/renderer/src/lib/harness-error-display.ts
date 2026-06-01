import {
  formatHarnessError,
  MISSING_API_KEY_MARKER,
  type HarnessErrorDisplay,
} from "../../../shared/harness-errors";

export type { HarnessErrorDisplay };

export function toHarnessErrorDisplay(
  raw: string | null | undefined,
  openRouterConfigured?: boolean,
): HarnessErrorDisplay | null {
  if (!raw?.trim()) return null;
  return formatHarnessError(raw, { openRouterConfigured });
}

/** Notice above the composer: API key setup until configured, else runtime error. */
export function getActiveChatNotice(options: {
  projectOpen: boolean;
  openRouterConfigured?: boolean;
  runtimeError?: string | null;
}): HarnessErrorDisplay | null {
  if (options.projectOpen && options.openRouterConfigured === false) {
    return formatHarnessError(MISSING_API_KEY_MARKER);
  }
  return toHarnessErrorDisplay(options.runtimeError, options.openRouterConfigured);
}
