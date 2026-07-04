import type { UseQueryResult } from "@tanstack/react-query";
import type { AzureDevOpsStatus, GithubStatus } from "../../../preload/api.js";
import type {
  DiscordStatus,
  LinearStatus,
  TeamsStatus,
} from "../../../preload/api.js";
import type { WorkflowIntegrationAvailability } from "../../../shared/workflow-template-availability.js";
import { useAzureDevOpsStatusQuery } from "./use-azure-devops";
import { useDiscordStatusQuery } from "./use-discord";
import { useGithubStatusQuery } from "./use-github";
import { useLinearStatusQuery } from "./use-linear";
import { useTeamsStatusQuery } from "./use-teams";

function resolveQueryFlag<T>(
  query: UseQueryResult<T | undefined, Error>,
  pick: (data: T) => boolean,
): boolean | null {
  if (!query.isFetched) return null;
  if (query.isError || !query.data) return false;
  return pick(query.data);
}

export type WorkflowIntegrationAvailabilityState = {
  availability: WorkflowIntegrationAvailability;
  isLoading: boolean;
};

export function useWorkflowIntegrationAvailability(): WorkflowIntegrationAvailabilityState {
  const githubStatusQuery = useGithubStatusQuery();
  const azureDevOpsStatusQuery = useAzureDevOpsStatusQuery();
  const teamsStatusQuery = useTeamsStatusQuery();
  const discordStatusQuery = useDiscordStatusQuery();
  const linearStatusQuery = useLinearStatusQuery();

  const githubReady = resolveQueryFlag(githubStatusQuery, (data: GithubStatus) =>
    Boolean(data.agentReady || (data.installations?.length ?? 0) > 0),
  );
  const azureDevOpsReady = resolveQueryFlag(
    azureDevOpsStatusQuery,
    (data: AzureDevOpsStatus) => Boolean(data.connected || data.agentReady),
  );
  const teamsConnected = resolveQueryFlag(
    teamsStatusQuery,
    (data: TeamsStatus) => data.connected,
  );
  const discordConnected = resolveQueryFlag(
    discordStatusQuery,
    (data: DiscordStatus) => data.connected,
  );
  const linearConnected = resolveQueryFlag(
    linearStatusQuery,
    (data: LinearStatus) => data.connected,
  );

  const flags = [
    githubReady,
    azureDevOpsReady,
    teamsConnected,
    discordConnected,
    linearConnected,
  ];
  const isLoading = flags.some((flag) => flag === null);

  return {
    isLoading,
    availability: {
      sourceControlReady: (githubReady ?? false) || (azureDevOpsReady ?? false),
      teamsConnected: teamsConnected ?? false,
      discordConnected: discordConnected ?? false,
      linearConnected: linearConnected ?? false,
    },
  };
}
