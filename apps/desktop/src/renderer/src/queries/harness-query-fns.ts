import type {
  GithubConnectResult,
  GithubProjectConnection,
  GithubStatus,
  OpenRouterAccountCreditsResult,
  SessionDiagnostics,
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
};
