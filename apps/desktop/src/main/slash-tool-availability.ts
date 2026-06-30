import type { SlashToolAvailability } from "../shared/thread-tools.js";
import { getExaApiKey } from "./exa-config.js";
import { fetchDiscordStatus, fetchGithubStatus, fetchTeamsStatus } from "./openharness-api.js";

export type { SlashToolAvailability } from "../shared/thread-tools.js";
export {
  filterAvailableSlashMenuItems,
  isSlashMenuItemAvailable,
} from "../shared/thread-tools.js";

const AVAILABILITY_CACHE_TTL_MS = 60_000;

let cachedAvailability: SlashToolAvailability | null = null;
let cachedAvailabilityExpiresAt = 0;
let availabilityPromise: Promise<SlashToolAvailability> | null = null;

async function fetchSlashToolAvailability(): Promise<SlashToolAvailability> {
  const exaConfigured = Boolean(getExaApiKey());
  const [githubResult, teamsResult, discordResult] = await Promise.allSettled([
    fetchGithubStatus(),
    fetchTeamsStatus(),
    fetchDiscordStatus(),
  ]);
  return {
    exaConfigured,
    githubActionsReady:
      githubResult.status === "fulfilled" ? githubResult.value.agentReady : false,
    teamsNotifyReady: teamsResult.status === "fulfilled" ? teamsResult.value.connected : false,
    discordNotifyReady:
      discordResult.status === "fulfilled" ? discordResult.value.connected : false,
  };
}

export async function getSlashToolAvailability(): Promise<SlashToolAvailability> {
  if (cachedAvailability && cachedAvailabilityExpiresAt > Date.now()) {
    return cachedAvailability;
  }
  if (!availabilityPromise) {
    availabilityPromise = fetchSlashToolAvailability()
      .then((availability) => {
        cachedAvailability = availability;
        cachedAvailabilityExpiresAt = Date.now() + AVAILABILITY_CACHE_TTL_MS;
        return availability;
      })
      .finally(() => {
        availabilityPromise = null;
      });
  }
  return availabilityPromise;
}
