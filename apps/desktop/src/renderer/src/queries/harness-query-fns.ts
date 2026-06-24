import type {
  DiscordChannelRepoMapping,
  DiscordStatus,
  GithubConnectResult,
  GithubProjectConnection,
  GithubStatus,
  OpenRouterAccountCreditsResult,
  SessionDiagnostics,
  TeamsChannelRepoMapping,
  TeamsStatus,
  WorkflowsListResponse,
} from "../../../preload/api";

export const harnessQueryFns = {
  listWorkflows: (): Promise<WorkflowsListResponse> => window.harness.listWorkflows(),

  listWorkflowRuns: (options?: {
    workflowId?: string;
    limit?: number;
    cursor?: string;
  }) => window.harness.listWorkflowRuns(options),

  getWorkflowRunStats: (options?: { workflowId?: string }) =>
    window.harness.getWorkflowRunStats(options),

  getGithubStatus: (): Promise<GithubStatus> => window.harness.getGithubStatus(),

  getAzureDevOpsStatus: () => window.harness.getAzureDevOpsStatus(),

  listAzureDevOpsRepos: (options?: { q?: string; page?: number }) =>
    window.harness.listAzureDevOpsRepos(options),

  listSourceControlRepos: (
    provider: "github" | "azure_devops",
    options?: { q?: string; page?: number },
  ) => window.harness.listSourceControlRepos(provider, options),

  getSessionDiagnostics: (): Promise<SessionDiagnostics> =>
    window.harness.getSessionDiagnostics(),

  getGithubConnection: (projectPath: string): Promise<GithubProjectConnection> =>
    window.harness.getGithubConnection({ projectPath }),

  listGithubRepos: (options?: { q?: string; page?: number }) =>
    window.harness.listGithubRepos(options),

  listRepoBranches: (options: { owner: string; repo: string }) =>
    window.harness.listRepoBranches(options),

  refreshCredits: (): Promise<OpenRouterAccountCreditsResult> =>
    window.harness.refreshCredits(),

  connectGithubRepo: (options: {
    projectPath: string;
    owner: string;
    repo: string;
    remoteUrl?: string | null;
  }): Promise<GithubConnectResult> => window.harness.connectGithubRepo(options),

  disconnectGithubRepo: (projectPath: string): Promise<{ ok: boolean }> =>
    window.harness.disconnectGithubRepo({ projectPath }),

  openGithubInstall: (): Promise<{ ok: boolean }> => window.harness.openGithubInstall(),

  getTeamsStatus: (): Promise<TeamsStatus> => window.harness.getTeamsStatus(),

  listTeamsMappings: (): Promise<{ mappings: TeamsChannelRepoMapping[] }> =>
    window.harness.listTeamsMappings(),

  listTeamsForUser: () => window.harness.listTeamsForUser(),

  listTeamsChannels: (options: { teamId: string }) =>
    window.harness.listTeamsChannels(options),

  openTeamsConnect: (): Promise<{ ok: boolean }> => window.harness.openTeamsConnect(),

  upsertTeamsMapping: (options: {
    installationId: string;
    teamId: string;
    channelId: string;
    channelName: string;
    provider?: string;
    namespace?: string;
    repoName?: string;
    githubOwner: string;
    githubRepo: string;
  }) => window.harness.upsertTeamsMapping(options),

  deleteTeamsMapping: (mappingId: string): Promise<{ ok: boolean }> =>
    window.harness.deleteTeamsMapping({ mappingId }),

  getDiscordStatus: (): Promise<DiscordStatus> => window.harness.getDiscordStatus(),

  listDiscordMappings: (): Promise<{ mappings: DiscordChannelRepoMapping[] }> =>
    window.harness.listDiscordMappings(),

  listDiscordGuilds: () => window.harness.listDiscordGuilds(),

  listDiscordChannels: (options: { guildId: string }) =>
    window.harness.listDiscordChannels(options),

  openDiscordConnect: (): Promise<{ ok: boolean }> => window.harness.openDiscordConnect(),

  upsertDiscordMapping: (options: {
    installationId: string;
    guildId: string;
    channelId: string;
    channelName: string;
    provider?: string;
    namespace?: string;
    repoName?: string;
    githubOwner: string;
    githubRepo: string;
  }) => window.harness.upsertDiscordMapping(options),

  deleteDiscordMapping: (mappingId: string): Promise<{ ok: boolean }> =>
    window.harness.deleteDiscordMapping({ mappingId }),

  getOrganization: () => window.harness.getOrganization(),

  listOrgMembers: () => window.harness.listOrgMembers(),

  getOrgCanManage: () => window.harness.getOrgCanManage(),

  getOrgInviteCode: () => window.harness.getOrgInviteCode(),

  updateOrganization: (options: { name: string }) => window.harness.updateOrganization(options),

  regenerateOrgInviteCode: () => window.harness.regenerateOrgInviteCode(),

  updateOrgMemberRole: (options: { memberId: string; role: "member" | "admin" | "owner" }) =>
    window.harness.updateOrgMemberRole(options),

  removeOrgMember: (options: { memberId: string }) => window.harness.removeOrgMember(options),

  listRunnerBindings: (options?: { runnerInstanceId?: string }) =>
    window.harness.listRunnerBindings(options),

  getWorkflowRunnerInstanceId: () => window.harness.getWorkflowRunnerInstanceId(),

  upsertRunnerBinding: (options: {
    connectionId: string;
    projectPath: string;
    label?: string | null;
  }) => window.harness.upsertRunnerBinding(options),

  connectAzureDevOps: (options: { orgName: string; pat: string }) =>
    window.harness.connectAzureDevOps(options),

  disconnectAzureDevOps: () => window.harness.disconnectAzureDevOps(),
};
