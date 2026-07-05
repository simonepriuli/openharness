import { Result } from "better-result";
import { tryAllowFailure } from "../result-helpers.js";

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
  lastMergeSourceCommit?: { commitId?: string };
  lastMergeTargetCommit?: { commitId?: string };
};

export type AdoPullRequestThread = {
  id: number;
  status?: number;
  threadContext?: {
    filePath?: string;
    rightFileStart?: { line?: number };
  };
  comments?: Array<{
    id: number;
    content?: string;
    author?: { id?: string; displayName?: string };
  }>;
};

export type AdoPullRequestIteration = {
  id: number;
  changeTrackingId?: number;
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

  async validateConnection(): Promise<{ authenticatedUser: string; profileId: string }> {
    const [connectionData, profile] = await Promise.all([
      this.request<{ authenticatedUser?: { providerDisplayName?: string; id?: string } }>(
        "/_apis/connectionData",
      ),
      this.request<{ id: string; displayName?: string }>("/_apis/profile/profiles/me"),
    ]);
    return {
      authenticatedUser:
        connectionData.authenticatedUser?.providerDisplayName ??
        profile.displayName ??
        "unknown",
      profileId: profile.id,
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

  async getPullRequestDiff(
    projectName: string,
    repoName: string,
    pullRequestId: number,
  ): Promise<string> {
    const version = API_VERSION;
    const url = this.baseUrl(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}?api-version=${version}&$includeCommits=true`,
    );
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader(this.pat),
        Accept: "text/plain",
      },
    });
    if (!response.ok) {
      return "";
    }
    return response.text();
  }

  async listPullRequestIterations(
    projectName: string,
    repoName: string,
    pullRequestId: number,
  ): Promise<AdoPullRequestIteration[]> {
    const data = await this.request<{ value?: AdoPullRequestIteration[] }>(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}/iterations`,
    );
    return data.value ?? [];
  }

  async listPullRequestChanges(
    projectName: string,
    repoName: string,
    pullRequestId: number,
    iterationId: number,
  ): Promise<Array<{ item?: { path?: string }; changeType?: string }>> {
    const data = await this.request<{
      changeEntries?: Array<{ item?: { path?: string }; changeType?: string }>;
    }>(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}/iterations/${iterationId}/changes`,
    );
    return data.changeEntries ?? [];
  }

  async listPullRequestThreads(
    projectName: string,
    repoName: string,
    pullRequestId: number,
  ): Promise<AdoPullRequestThread[]> {
    const data = await this.request<{ value?: AdoPullRequestThread[] }>(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}/threads`,
    );
    return data.value ?? [];
  }

  async createPullRequestThread(
    projectName: string,
    repoName: string,
    pullRequestId: number,
    content: string,
    options?: {
      threadContext?: {
        filePath: string;
        line: number;
      };
      pullRequestThreadContext?: {
        changeTrackingId: number;
        firstComparingIteration: number;
        secondComparingIteration: number;
      };
    },
  ): Promise<{ id: number }> {
    const body: Record<string, unknown> = {
      comments: [{ parentCommentId: 0, content, commentType: 1 }],
      status: 1,
    };

    if (options?.threadContext) {
      const { filePath, line } = options.threadContext;
      const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
      body.threadContext = {
        filePath: normalizedPath,
        rightFileStart: { line, offset: 0 },
        rightFileEnd: { line, offset: 1 },
      };
    }

    if (options?.pullRequestThreadContext) {
      body.pullRequestThreadContext = {
        changeTrackingId: options.pullRequestThreadContext.changeTrackingId,
        iterationContext: {
          firstComparingIteration: options.pullRequestThreadContext.firstComparingIteration,
          secondComparingIteration: options.pullRequestThreadContext.secondComparingIteration,
        },
      };
    }

    return this.request<{ id: number }>(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}/threads`,
      { method: "POST", body },
    );
  }

  async replyToPullRequestThread(
    projectName: string,
    repoName: string,
    pullRequestId: number,
    threadId: number,
    content: string,
    parentCommentId = 1,
  ): Promise<void> {
    await this.request(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}/threads/${threadId}/comments`,
      {
        method: "POST",
        body: {
          content,
          parentCommentId,
          commentType: 1,
        },
      },
    );
  }

  async resolvePullRequestThread(
    projectName: string,
    repoName: string,
    pullRequestId: number,
    threadId: number,
  ): Promise<void> {
    await this.request(
      `/${encodeURIComponent(projectName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${pullRequestId}/threads/${threadId}`,
      {
        method: "PATCH",
        body: { status: 2 },
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

  const parsedResult = tryAllowFailure(() => new URL(url));
  if (Result.isError(parsedResult)) return null;
  const parsed = parsedResult.value as URL;
  if (!parsed.hostname.includes("dev.azure.com")) return null;
  const parts = parsed.pathname.replace(/^\//, "").split("/");
  // {org}/{project}/_git/{repo}
  if (parts.length >= 4 && parts[1] && parts[2] === "_git" && parts[3]) {
    return { org: parts[0]!, project: parts[1]!, repo: parts[3]!.replace(/\.git$/i, "") };
  }

  return null;
}
