export const remoteKeys = {
  all: ["remote"] as const,

  workflows: () => [...remoteKeys.all, "workflows"] as const,

  workflowRuns: (filters?: {
    workflowId?: string;
    limit?: number;
    cursor?: string;
  }) => [...remoteKeys.all, "workflowRuns", filters ?? {}] as const,

  workflowStats: (workflowId?: string) =>
    [...remoteKeys.all, "workflowStats", workflowId ?? null] as const,

  workflowRun: (runId: string) => [...remoteKeys.all, "workflowRun", runId] as const,

  github: {
    all: () => [...remoteKeys.all, "github"] as const,
    status: () => [...remoteKeys.github.all(), "status"] as const,
    connection: (projectPath: string) =>
      [...remoteKeys.github.all(), "connection", projectPath] as const,
    repos: (filters?: { q?: string; page?: number }) =>
      [...remoteKeys.github.all(), "repos", filters ?? {}] as const,
    branches: (owner: string, repo: string) =>
      [...remoteKeys.github.all(), "branches", owner, repo] as const,
  },

  session: {
    diagnostics: () => [...remoteKeys.all, "session", "diagnostics"] as const,
  },

  credits: () => [...remoteKeys.all, "credits"] as const,

  azureDevOps: {
    all: () => [...remoteKeys.all, "azureDevOps"] as const,
    status: () => [...remoteKeys.azureDevOps.all(), "status"] as const,
    repos: (filters?: { q?: string; page?: number }) =>
      [...remoteKeys.azureDevOps.all(), "repos", filters ?? {}] as const,
  },

  teams: {
    all: () => [...remoteKeys.all, "teams"] as const,
    status: () => [...remoteKeys.teams.all(), "status"] as const,
    mappings: () => [...remoteKeys.teams.all(), "mappings"] as const,
    teams: () => [...remoteKeys.teams.all(), "teams"] as const,
    channels: (teamId: string) => [...remoteKeys.teams.all(), "channels", teamId] as const,
  },
  discord: {
    all: () => [...remoteKeys.all, "discord"] as const,
    status: () => [...remoteKeys.discord.all(), "status"] as const,
    mappings: () => [...remoteKeys.discord.all(), "mappings"] as const,
    guilds: () => [...remoteKeys.discord.all(), "guilds"] as const,
    channels: (guildId: string) => [...remoteKeys.discord.all(), "channels", guildId] as const,
  },

  org: {
    all: () => [...remoteKeys.all, "org"] as const,
    organization: () => [...remoteKeys.org.all(), "organization"] as const,
    members: () => [...remoteKeys.org.all(), "members"] as const,
    canManage: () => [...remoteKeys.org.all(), "canManage"] as const,
    inviteCode: () => [...remoteKeys.org.all(), "inviteCode"] as const,
  },

  runners: {
    all: () => [...remoteKeys.all, "runners"] as const,
    bindings: () => [...remoteKeys.runners.all(), "bindings"] as const,
    instanceId: () => [...remoteKeys.runners.all(), "instanceId"] as const,
  },
} as const;
