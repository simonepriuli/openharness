const API_VERSION = "7.1";

export type AzureDevOpsProject = {
  id: string;
  name: string;
};

export type AzureDevOpsRepository = {
  id: string;
  name: string;
  project: { id: string; name: string };
  remoteUrl?: string;
  defaultBranch?: string;
};

export type AzureDevOpsPullRequest = {
  pullRequestId: number;
  title?: string;
  description?: string;
  sourceRefName?: string;
  targetRefName?: string;
  createdBy?: { displayName?: string };
  url?: string;
};

function authHeader(pat: string): string {
  return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
}

export class AzureDevOpsClient {
  constructor(
    private readonly orgName: string,
    private readonly pat: string,
  ) {}

  private baseUrl(path: string): string {
    return `https://dev.azure.com/${encodeURIComponent(this.orgName)}${path}`;
  }

  async request<T>(
    path: string,
    options?: { method?: string; body?: unknown; apiVersion?: string },
  ): Promise<T> {
    const version = options?.apiVersion ?? API_VERSION;
    const separator = path.includes("?") ? "&" : "?";
    const url = this.baseUrl(`${path}${separator}api-version=${version}`);

    const response = await fetch(url, {
      method: options?.method ?? "GET",
      headers: {
        Authorization: authHeader(this.pat),
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Azure DevOps API error (${response.status}): ${text || response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async validateConnection(): Promise<{ authenticatedUser: string }> {
    const data = await this.request<{ authenticatedUser?: { providerDisplayName?: string } }>(
      "/_apis/connectionData",
    );
    return {
      authenticatedUser: data.authenticatedUser?.providerDisplayName ?? "unknown",
    };
  }

  async listProjects(): Promise<AzureDevOpsProject[]> {
    const data = await this.request<{ value?: AzureDevOpsProject[] }>("/_apis/projects");
    return data.value ?? [];
  }

  async listRepositories(projectName: string): Promise<AzureDevOpsRepository[]> {
    const data = await this.request<{ value?: AzureDevOpsRepository[] }>(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories`,
    );
    return data.value ?? [];
  }

  async listAllRepositories(): Promise<AzureDevOpsRepository[]> {
    const projects = await this.listProjects();
    const repos: AzureDevOpsRepository[] = [];
    for (const project of projects) {
      const projectRepos = await this.listRepositories(project.name);
      repos.push(...projectRepos);
    }
    return repos;
  }

  async listBranches(
    projectName: string,
    repoName: string,
  ): Promise<{ defaultBranch: string; branches: string[] }> {
    const repo = await this.request<AzureDevOpsRepository>(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}`,
    );
    const defaultBranch = (repo.defaultBranch ?? "refs/heads/main").replace(/^refs\/heads\//, "");

    const data = await this.request<{ value?: Array<{ name: string }> }>(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/refs?filter=heads/`,
    );

    const branches = (data.value ?? [])
      .map((ref) => ref.name.replace(/^refs\/heads\//, ""))
      .filter(Boolean);

    return { defaultBranch, branches: branches.length > 0 ? branches : [defaultBranch] };
  }

  async getPullRequest(
    projectName: string,
    repoName: string,
    pullRequestId: number,
  ): Promise<AzureDevOpsPullRequest> {
    return this.request<AzureDevOpsPullRequest>(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}`,
    );
  }

  async createPullRequestThread(
    projectName: string,
    repoName: string,
    pullRequestId: number,
    content: string,
  ): Promise<void> {
    await this.request(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}/threads`,
      {
        method: "POST",
        body: {
          comments: [{ parentCommentId: 0, content, commentType: 1 }],
          status: 1,
        },
      },
    );
  }

  async approvePullRequest(
    projectName: string,
    repoName: string,
    pullRequestId: number,
    reviewerId: string,
  ): Promise<void> {
    await this.request(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}/reviewers/${reviewerId}`,
      {
        method: "PUT",
        body: { vote: 10 },
      },
    );
  }

  async getCurrentUserDescriptor(): Promise<string> {
    const profile = await this.request<{ id: string }>("/_apis/profile/profiles/me");
    return profile.id;
  }

  async createServiceHookSubscription(
    projectId: string,
    eventType: string,
    webhookUrl: string,
    repositoryId: string,
  ): Promise<{ id: string }> {
    return this.request<{ id: string }>("/_apis/hooks/subscriptions", {
      method: "POST",
      body: {
        publisherId: "tfs",
        eventType,
        resourceVersion: "1.0",
        consumerId: "webHooks",
        consumerActionId: "httpRequest",
        publisherInputs: {
          projectId,
          repository: repositoryId,
        },
        consumerInputs: {
          url: webhookUrl,
        },
      },
    });
  }

  async deleteServiceHookSubscription(subscriptionId: string): Promise<void> {
    await this.request(`/_apis/hooks/subscriptions/${subscriptionId}`, { method: "DELETE" });
  }
}

export function parseAzureDevOpsRemoteUrl(
  remoteUrl: string,
): { org: string; project: string; repo: string } | null {
  const url = remoteUrl.trim();

  const sshMatch = url.match(
    /^ssh:\/\/git@ssh\.dev\.azure\.com\/v3\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/i,
  );
  if (sshMatch) {
    return { org: sshMatch[1]!, project: sshMatch[2]!, repo: sshMatch[3]!.replace(/\.git$/i, "") };
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("dev.azure.com")) return null;
    const parts = parsed.pathname.replace(/^\//, "").split("/");
    // {org}/{project}/_git/{repo}
    if (parts.length >= 4 && parts[1] && parts[2] === "_git" && parts[3]) {
      return { org: parts[0]!, project: parts[1]!, repo: parts[3]!.replace(/\.git$/i, "") };
    }
  } catch {
    return null;
  }

  return null;
}
