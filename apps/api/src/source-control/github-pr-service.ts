import { Result } from "better-result";
import { GithubApiError } from "../errors.js";
import { githubAppFetch, getInstallationAccessToken } from "../github/app-auth.js";
import type {
  GitCredentials,
  InlineCommentInput,
  PrContext,
  PrContextComment,
  PrContextFile,
  PrContextThread,
  SubmitReviewInput,
} from "./pr-context.js";

type GithubAppFetch = typeof githubAppFetch;

function mapGithubResponseError(
  response: Response,
  text: string,
  fallbackMessage: string,
): GithubApiError {
  return new GithubApiError({
    message: text || fallbackMessage,
    status: response.status,
  });
}

export async function githubFindOpenPullRequestByHead(
  installationId: string,
  owner: string,
  repo: string,
  headRef: string,
  deps: { fetch: GithubAppFetch } = { fetch: githubAppFetch },
): Promise<Result<{ number: number; title: string; url: string } | null, GithubApiError>> {
  const head = `${owner}:${headRef.trim()}`;
  const responseResult = await deps.fetch(
    `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(head)}&per_page=1`,
    { installationId },
  );
  if (Result.isError(responseResult)) return Result.err(responseResult.error);

  const response = responseResult.value;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return Result.err(mapGithubResponseError(response, text, "Failed to find open pull request"));
  }

  const pulls = (await response.json()) as Array<{
    number: number;
    title: string;
    html_url: string;
  }>;
  const pull = pulls[0];
  if (!pull) return Result.ok(null);
  return Result.ok({ number: pull.number, title: pull.title, url: pull.html_url });
}

export async function githubFetchGitCredentials(
  installationId: string,
  owner: string,
  repo: string,
): Promise<Result<GitCredentials, GithubApiError>> {
  const tokenResult = await getInstallationAccessToken(installationId);
  if (Result.isError(tokenResult)) return Result.err(tokenResult.error);
  return Result.ok({
    username: "x-access-token",
    token: tokenResult.value,
    remoteUrl: `https://github.com/${owner}/${repo}.git`,
  });
}

export async function githubFetchPrContext(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<Result<PrContext, GithubApiError>> {
  const batch = await Promise.all([
      githubAppFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, { installationId }),
      githubAppFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, {
        installationId,
      }),
      githubAppFetch(`/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`, {
        installationId,
      }),
      githubAppFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`, {
        installationId,
      }),
    ]);
  const [responses, batchErrors] = Result.partition(batch);
  if (batchErrors.length > 0) {
    return Result.err(batchErrors[0]!);
  }

  const [prRes, filesRes, commentsRes, reviewCommentsRes] = responses;

  if (!prRes.ok) {
    const text = await prRes.text().catch(() => "");
    return Result.err(mapGithubResponseError(prRes, text, "Failed to fetch PR"));
  }

  const pullRequest = (await prRes.json()) as {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
  };
  const files = filesRes.ok
    ? ((await filesRes.json()) as Array<{ filename: string; patch?: string }>)
    : [];
  const issueComments = commentsRes.ok
    ? ((await commentsRes.json()) as Array<{ id: number; body: string; user?: { login?: string } }>)
    : [];
  const reviewComments = reviewCommentsRes.ok
    ? ((await reviewCommentsRes.json()) as Array<{
        id: number;
        body: string;
        pull_request_review_id?: number;
        user?: { login?: string };
      }>)
    : [];

  const diffResResult = await githubAppFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, {
    installationId,
    headers: { Accept: "application/vnd.github.v3.diff" },
  });
  if (Result.isError(diffResResult)) return Result.err(diffResResult.error);
  const diff = diffResResult.value.ok ? await diffResResult.value.text() : "";

  const rawThreadsResult = await githubFetchReviewThreads(installationId, owner, repo, prNumber);
  if (Result.isError(rawThreadsResult)) return Result.err(rawThreadsResult.error);
  const threads: PrContextThread[] = rawThreadsResult.value.map((thread) => ({
    id: thread.id,
    isResolved: thread.isResolved,
    path: thread.path,
    line: thread.line ?? undefined,
    comments: thread.comments.nodes.map((comment) => ({
      id: String(comment.databaseId),
      body: comment.body,
      authorName: comment.author?.login,
    })),
  }));

  const context: PrContext = {
    provider: "github",
    pullRequest: {
      number: pullRequest.number,
      title: pullRequest.title,
      body: pullRequest.body,
      url: pullRequest.html_url,
      headRef: pullRequest.head.ref,
      headSha: pullRequest.head.sha,
      baseRef: pullRequest.base.ref,
      baseSha: pullRequest.base.sha,
    },
    files: files.map(
      (file): PrContextFile => ({
        path: file.filename,
        patch: file.patch ?? null,
      }),
    ),
    diff,
    threads,
    issueComments: issueComments.map(
      (comment): PrContextComment => ({
        id: String(comment.id),
        body: comment.body,
        authorName: comment.user?.login,
      }),
    ),
  };

  void reviewComments;
  return Result.ok(context);
}

export async function githubSubmitReview(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  input: SubmitReviewInput,
): Promise<Result<void, GithubApiError>> {
  const payload: Record<string, unknown> = {
    event: input.event,
    body: input.body,
  };
  if (input.commitId) payload.commit_id = input.commitId;
  if (input.comments?.length) {
    payload.comments = input.comments.map((comment) => ({
      path: comment.path,
      line: comment.line,
      body: comment.body,
      side: comment.side ?? "RIGHT",
    }));
  }

  const responseResult = await githubAppFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (Result.isError(responseResult)) return Result.err(responseResult.error);

  const response = responseResult.value;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return Result.err(mapGithubResponseError(response, text, "Failed to submit review"));
  }
  return Result.ok(undefined);
}

export async function githubCreateInlineComment(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  input: InlineCommentInput & { commitId: string },
): Promise<Result<void, GithubApiError>> {
  const responseResult = await githubAppFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body: input.body,
      commit_id: input.commitId,
      path: input.path,
      line: input.line,
      side: input.side ?? "RIGHT",
    }),
  });
  if (Result.isError(responseResult)) return Result.err(responseResult.error);

  const response = responseResult.value;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return Result.err(mapGithubResponseError(response, text, "Failed to post review comment"));
  }
  return Result.ok(undefined);
}

export async function githubReplyToThread(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  commentId: string,
  body: string,
): Promise<Result<void, GithubApiError>> {
  const responseResult = await githubAppFetch(
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments/${commentId}/replies`,
    {
      method: "POST",
      installationId,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  if (Result.isError(responseResult)) return Result.err(responseResult.error);

  const response = responseResult.value;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return Result.err(mapGithubResponseError(response, text, "Failed to reply to comment"));
  }
  return Result.ok(undefined);
}

export async function githubResolveThread(
  installationId: string,
  threadId: string,
): Promise<Result<void, GithubApiError>> {
  const mutation = `
    mutation($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread { isResolved }
      }
    }
  `;

  const responseResult = await githubAppFetch("/graphql", {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: mutation,
      variables: { threadId },
    }),
  });
  if (Result.isError(responseResult)) return Result.err(responseResult.error);

  const response = responseResult.value;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return Result.err(mapGithubResponseError(response, text, "Failed to resolve thread"));
  }
  return Result.ok(undefined);
}

export type CreatePullRequestInput = {
  title: string;
  body: string;
  head: string;
  base?: string;
};

export type CreatedPullRequest = {
  number: number;
  title: string;
  url: string;
  headRef: string;
  baseRef: string;
};

export async function githubCreatePullRequest(
  installationId: string,
  owner: string,
  repo: string,
  input: CreatePullRequestInput,
  deps: { fetch: GithubAppFetch } = { fetch: githubAppFetch },
): Promise<Result<CreatedPullRequest, GithubApiError>> {
  let base = input.base?.trim();
  if (!base) {
    const repoResResult = await deps.fetch(`/repos/${owner}/${repo}`, { installationId });
    if (Result.isError(repoResResult)) return Result.err(repoResResult.error);

    const repoRes = repoResResult.value;
    if (!repoRes.ok) {
      const text = await repoRes.text().catch(() => "");
      return Result.err(
        mapGithubResponseError(repoRes, text, "Failed to fetch repository default branch"),
      );
    }
    const repoData = (await repoRes.json()) as { default_branch?: string };
    base = repoData.default_branch?.trim() || "main";
  }

  const responseResult = await deps.fetch(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.head,
      base,
    }),
  });
  if (Result.isError(responseResult)) return Result.err(responseResult.error);

  const response = responseResult.value;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return Result.err(mapGithubResponseError(response, text, "Failed to create pull request"));
  }

  const pull = (await response.json()) as {
    number: number;
    title: string;
    html_url: string;
    head: { ref: string };
    base: { ref: string };
  };
  return Result.ok({
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    headRef: pull.head.ref,
    baseRef: pull.base.ref,
  });
}

export async function githubPostIssueComment(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<Result<void, GithubApiError>> {
  const responseResult = await githubAppFetch(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (Result.isError(responseResult)) return Result.err(responseResult.error);

  const response = responseResult.value;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return Result.err(mapGithubResponseError(response, text, "Failed to post comment"));
  }
  return Result.ok(undefined);
}

type ReviewThread = {
  id: string;
  isResolved: boolean;
  path: string;
  line: number | null;
  comments: {
    nodes: Array<{
      id: string;
      databaseId: number;
      body: string;
      author: { login: string } | null;
    }>;
  };
};

async function githubFetchReviewThreads(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<Result<ReviewThread[], GithubApiError>> {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              path
              line
              comments(first: 50) {
                nodes {
                  id
                  databaseId
                  body
                  author { login }
                }
              }
            }
          }
        }
      }
    }
  `;

  const responseResult = await githubAppFetch("/graphql", {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { owner, repo, number: prNumber },
    }),
  });
  if (Result.isError(responseResult)) return Result.err(responseResult.error);

  const response = responseResult.value;
  if (!response.ok) return Result.ok([]);

  const data = (await response.json()) as {
    data?: {
      repository?: {
        pullRequest?: {
          reviewThreads?: {
            nodes?: ReviewThread[];
          };
        };
      };
    };
  };

  return Result.ok(data.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []);
}
