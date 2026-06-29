import type { SlashToolAvailability } from "../shared/thread-tools.js";
import { getExaApiKey } from "./exa-config.js";
import { fetchGithubStatus } from "./openharness-api.js";

export type { SlashToolAvailability } from "../shared/thread-tools.js";
export {
  filterAvailableSlashMenuItems,
  isSlashMenuItemAvailable,
} from "../shared/thread-tools.js";

export async function getSlashToolAvailability(): Promise<SlashToolAvailability> {
  const exaConfigured = Boolean(getExaApiKey());
  let githubActionsReady = false;
  try {
    const status = await fetchGithubStatus();
    githubActionsReady = status.agentReady;
  } catch {
    githubActionsReady = false;
  }
  return { exaConfigured, githubActionsReady };
}
