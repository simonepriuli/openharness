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

export async function githubFetchGitCredentials(
  installationId: string,
  owner: string,
  repo: string,
): Promise<GitCredentials> {
  const token = await getInstallationAccessToken(installationId);
  return {
    username: "x-access-token",
    token,
    remoteUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

export async function githubFetchPrContext(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrContext> {
  const [prRes, filesRes, commentsRes, reviewCommentsRes] = await Promise.all([
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

  if (!prRes.ok) {
    const text = await prRes.text().catch(() => "");
    throw new Error(`Failed to fetch PR: ${text}`);
  }

  const pullRequest = (await prRes.json()) as {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
  };
  const files = filesRes.ok ? ((await filesRes.json()) as Array<{ filename: string; patch?: string }>) : [];
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

  const diffRes = await githubAppFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, {
    installationId,
    headers: { Accept: "application/vnd.github.v3.diff" },
  });
  const diff = diffRes.ok ? await diffRes.text() : "";

  const rawThreads = await githubFetchReviewThreads(installationId, owner, repo, prNumber);
  const threads: PrContextThread[] = rawThreads.map((thread) => ({
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
  return context;
}

export async function githubSubmitReview(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  input: SubmitReviewInput,
): Promise<void> {
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

  const response = await githubAppFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to submit review");
  }
}

export async function githubCreateInlineComment(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  input: InlineCommentInput & { commitId: string },
): Promise<void> {
  const response = await githubAppFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
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
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to post review comment");
  }
}

export async function githubReplyToThread(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  commentId: string,
  body: string,
): Promise<void> {
  const response = await githubAppFetch(
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments/${commentId}/replies`,
    {
      method: "POST",
      installationId,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to reply to comment");
  }
}

export async function githubResolveThread(
  installationId: string,
  threadId: string,
): Promise<void> {
  const mutation = `
    mutation($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread { isResolved }
      }
    }
  `;

  const response = await githubAppFetch("/graphql", {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: mutation,
      variables: { threadId },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to resolve thread");
  }
}

export async function githubPostIssueComment(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  const response = await githubAppFetch(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to post comment");
  }
}

async function githubFetchReviewThreads(
  installationId: string,
  owner: string,
  repo: string,
  prNumber: number,
) {
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

  const response = await githubAppFetch("/graphql", {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { owner, repo, number: prNumber },
    }),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as {
    data?: {
      repository?: {
        pullRequest?: {
          reviewThreads?: {
            nodes?: Array<{
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
            }>;
          };
        };
      };
    };
  };

  return data.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
}
