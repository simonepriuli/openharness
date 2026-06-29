import type { SlashToolAvailability } from "../shared/thread-tools.js";
import { getExaApiKey } from "./exa-config.js";
import { fetchDiscordStatus, fetchGithubStatus, fetchTeamsStatus } from "./openharness-api.js";

export type { SlashToolAvailability } from "../shared/thread-tools.js";
export {
  filterAvailableSlashMenuItems,
  isSlashMenuItemAvailable,
} from "../shared/thread-tools.js";

export async function getSlashToolAvailability(): Promise<SlashToolAvailability> {
  const exaConfigured = Boolean(getExaApiKey());
  let githubActionsReady = false;
  let teamsNotifyReady = false;
  let discordNotifyReady = false;
  try {
    const status = await fetchGithubStatus();
    githubActionsReady = status.agentReady;
  } catch {
    githubActionsReady = false;
  }
  try {
    const status = await fetchTeamsStatus();
    teamsNotifyReady = status.connected;
  } catch {
    teamsNotifyReady = false;
  }
  try {
    const status = await fetchDiscordStatus();
    discordNotifyReady = status.connected;
  } catch {
    discordNotifyReady = false;
  }
  return { exaConfigured, githubActionsReady, teamsNotifyReady, discordNotifyReady };
}
