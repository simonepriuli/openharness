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

  getWorkflowRun: (runId: string) => window.harness.getWorkflowRun(runId),

  dismissWorkflowRun: (options: { runId: string; reason?: string }) =>
    window.harness.dismissWorkflowRun(options),

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

  connectSourceControlRepo: (options: {
    provider: "github" | "azure_devops";
    projectPath: string;
    owner: string;
    repo: string;
    remoteUrl?: string | null;
  }): Promise<GithubConnectResult> => window.harness.connectSourceControlRepo(options),

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

  getLinearStatus: (): Promise<import("../../../preload/api").LinearStatus> =>
    window.harness.getLinearStatus(),

  listLinearMappings: (): Promise<{ mappings: import("../../../preload/api").LinearProjectRepoMapping[] }> =>
    window.harness.listLinearMappings(),

  listLinearProjects: (): Promise<{ projects: import("../../../preload/api").LinearProjectSummary[] }> =>
    window.harness.listLinearProjects(),

  openLinearConnect: (): Promise<{ ok: boolean }> => window.harness.openLinearConnect(),

  deleteLinearInstallation: (): Promise<{ ok: boolean }> => window.harness.deleteLinearInstallation(),

  upsertLinearMapping: (options: {
    installationId: string;
    projectId: string;
    projectName: string;
    provider: string;
    namespace: string;
    repoName: string;
    projectSourceControlConnectionId?: string | null;
  }) => window.harness.upsertLinearMapping(options),

  deleteLinearMapping: (mappingId: string): Promise<{ ok: boolean }> =>
    window.harness.deleteLinearMapping({ mappingId }),

  getOrganization: () => window.harness.getOrganization(),

  listOrgMembers: () => window.harness.listOrgMembers(),

  getOrgCanManage: () => window.harness.getOrgCanManage(),

  getOrgInviteCode: () => window.harness.getOrgInviteCode(),

  updateOrganization: (options: {
    name?: string;
    cloudWorkersEnabled?: boolean;
  }) => window.harness.updateOrganization(options),

  regenerateOrgInviteCode: () => window.harness.regenerateOrgInviteCode(),

  updateOrgMemberRole: (options: { memberId: string; role: "member" | "admin" | "owner" }) =>
    window.harness.updateOrgMemberRole(options),

  removeOrgMember: (options: { memberId: string }) => window.harness.removeOrgMember(options),

  getOrgSecrets: () => window.harness.getOrgSecrets(),

  upsertOrgSecret: (options: { slot: string; value: string }) =>
    window.harness.upsertOrgSecret(options),

  deleteOrgSecret: (options: { slot: string }) => window.harness.deleteOrgSecret(options),

  listRepoEnvironments: () => window.harness.listRepoEnvironments(),

  listRepoEnvironmentVariables: (options: { connectionId: string }) =>
    window.harness.listRepoEnvironmentVariables(options),

  upsertRepoEnvironmentVariable: (options: {
    connectionId: string;
    key: string;
    value: string;
    isSecret: boolean;
    description?: string | null;
  }) => window.harness.upsertRepoEnvironmentVariable(options),

  deleteRepoEnvironmentVariable: (options: { connectionId: string; key: string }) =>
    window.harness.deleteRepoEnvironmentVariable(options),

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
