import { and, createDb, eq, sql } from "@openharness/db";
import { Hono } from "hono";
import { projectGithubConnection, workflowSetting } from "@openharness/db/schema";
import type { AuthSession } from "../auth.js";
import { env } from "../env.js";
import { githubAppFetch, getInstallationAccessToken } from "./app-auth.js";
import { findRepoInUserInstallations, getProjectConnection, remoteMismatchWarning } from "./sync.js";
import {
  listUserWorkflowInstances,
  upsertWorkflowSetting,
} from "./workflow-db.js";
import { DEFAULT_WORKFLOW_DEFINITIONS, type WorkflowType } from "./workflow-constants.js";
import { randomUUID } from "node:crypto";

type GithubVariables = {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
};

const db = createDb(env.databaseUrl());

function requireUser(c: { get: (key: "user") => AuthSession["user"] | null }) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

async function resolveInstallationId(
  userId: string,
  owner: string,
  repo: string,
): Promise<string | null> {
  const record = await findRepoInUserInstallations(db, userId, owner, repo);
  return record?.installationId ?? null;
}

export const workflowSettingsRoutes = new Hono<{ Variables: GithubVariables }>();

async function upsertProjectGithubConnection(
  userId: string,
  input: {
    projectPath: string;
    owner: string;
    repo: string;
    remoteUrl: string | null;
    githubRepoId: string;
    installationId: string;
  },
): Promise<string> {
  const existing = await getProjectConnection(db, userId, input.projectPath);
  if (existing) {
    await db
      .update(projectGithubConnection)
      .set({
        githubOwner: input.owner,
        githubRepo: input.repo,
        githubRepoId: input.githubRepoId,
        installationId: input.installationId,
        remoteUrl: input.remoteUrl,
        updatedAt: new Date(),
      })
      .where(eq(projectGithubConnection.id, existing.id));
    return existing.id;
  }

  const connectionId = randomUUID();
  await db.insert(projectGithubConnection).values({
    id: connectionId,
    userId,
    projectPath: input.projectPath,
    githubOwner: input.owner,
    githubRepo: input.repo,
    githubRepoId: input.githubRepoId,
    installationId: input.installationId,
    remoteUrl: input.remoteUrl,
  });
  return connectionId;
}

workflowSettingsRoutes.get("/", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workflows = await listUserWorkflowInstances(db, user.id);
  return c.json({
    templates: DEFAULT_WORKFLOW_DEFINITIONS,
    workflows,
  });
});

workflowSettingsRoutes.post("/create", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.projectPath !== "string" ||
    typeof body.owner !== "string" ||
    typeof body.repo !== "string" ||
    typeof body.workflowType !== "string"
  ) {
    return c.json({ error: "projectPath, owner, repo, and workflowType are required" }, 400);
  }

  if (body.workflowType !== "pr_review" && body.workflowType !== "comment_fixer") {
    return c.json({ error: "Invalid workflowType" }, 400);
  }

  const remoteUrl = typeof body.remoteUrl === "string" ? body.remoteUrl : null;
  const repoRecord = await findRepoInUserInstallations(db, user.id, body.owner, body.repo);
  if (!repoRecord) {
    return c.json(
      {
        error: "repo_not_accessible",
        message: "Install the OpenHarness GitHub App on this repository first.",
      },
      403,
    );
  }

  const connectionId = await upsertProjectGithubConnection(user.id, {
    projectPath: body.projectPath,
    owner: body.owner,
    repo: body.repo,
    remoteUrl,
    githubRepoId: repoRecord.githubRepoId,
    installationId: repoRecord.installationId,
  });

  const existingForRepo = await db
    .select({ id: workflowSetting.id })
    .from(workflowSetting)
    .innerJoin(
      projectGithubConnection,
      eq(workflowSetting.projectGithubConnectionId, projectGithubConnection.id),
    )
    .where(
      and(
        eq(workflowSetting.userId, user.id),
        eq(workflowSetting.workflowType, body.workflowType),
        eq(workflowSetting.enabled, true),
        sql`lower(${projectGithubConnection.githubOwner}) = ${body.owner.toLowerCase()}`,
        sql`lower(${projectGithubConnection.githubRepo}) = ${body.repo.toLowerCase()}`,
      ),
    )
    .limit(1);

  if (existingForRepo[0]) {
    return c.json(
      { error: "workflow_exists", message: "This workflow is already assigned to the repository." },
      409,
    );
  }

  await upsertWorkflowSetting(
    db,
    user.id,
    connectionId,
    body.workflowType as WorkflowType,
    true,
  );

  const warning = remoteMismatchWarning(remoteUrl, body.owner, body.repo);
  const workflows = await listUserWorkflowInstances(db, user.id);
  return c.json({ ok: true, warning, workflows });
});

workflowSettingsRoutes.put("/", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.connectionId !== "string" ||
    typeof body.workflowType !== "string" ||
    typeof body.enabled !== "boolean"
  ) {
    return c.json({ error: "connectionId, workflowType, and enabled are required" }, 400);
  }

  if (body.workflowType !== "pr_review" && body.workflowType !== "comment_fixer") {
    return c.json({ error: "Invalid workflowType" }, 400);
  }

  const connectionRows = await db
    .select({ id: projectGithubConnection.id })
    .from(projectGithubConnection)
    .where(
      and(
        eq(projectGithubConnection.id, body.connectionId),
        eq(projectGithubConnection.userId, user.id),
      ),
    )
    .limit(1);

  if (!connectionRows[0]) {
    return c.json({ error: "Connection not found" }, 404);
  }

  await upsertWorkflowSetting(
    db,
    user.id,
    body.connectionId,
    body.workflowType as WorkflowType,
    body.enabled,
  );

  const workflows = await listUserWorkflowInstances(db, user.id);
  return c.json({ ok: true, workflows });
});

export const prActionRoutes = new Hono<{ Variables: GithubVariables }>();

prActionRoutes.get("/:owner/:repo/git-credentials", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const installationId = await resolveInstallationId(user.id, owner, repo);
  if (!installationId) {
    return c.json({ error: "Repository not accessible" }, 403);
  }

  const token = await getInstallationAccessToken(installationId);
  return c.json({
    username: "x-access-token",
    token,
    remoteUrl: `https://github.com/${owner}/${repo}.git`,
  });
});

prActionRoutes.post("/:owner/:repo/threads/:threadId/resolve", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const threadId = c.req.param("threadId");
  const installationId = await resolveInstallationId(user.id, owner, repo);
  if (!installationId) {
    return c.json({ error: "Repository not accessible" }, 403);
  }

  const resolved = await resolveReviewThread(installationId, threadId);
  if (!resolved.ok) {
    return c.json({ error: resolved.error }, 400);
  }

  return c.json({ ok: true });
});

prActionRoutes.get("/:owner/:repo/:number/context", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = c.req.param("number");
  const installationId = await resolveInstallationId(user.id, owner, repo);
  if (!installationId) {
    return c.json({ error: "Repository not accessible" }, 403);
  }

  const [prRes, filesRes, commentsRes, reviewCommentsRes] = await Promise.all([
    githubAppFetch(`/repos/${owner}/${repo}/pulls/${number}`, { installationId }),
    githubAppFetch(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`, {
      installationId,
    }),
    githubAppFetch(`/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`, {
      installationId,
    }),
    githubAppFetch(`/repos/${owner}/${repo}/pulls/${number}/comments?per_page=100`, {
      installationId,
    }),
  ]);

  if (!prRes.ok) {
    const text = await prRes.text().catch(() => "");
    return c.json({ error: `Failed to fetch PR: ${text}` }, prRes.status as 400);
  }

  const pullRequest = await prRes.json();
  const files = filesRes.ok ? await filesRes.json() : [];
  const issueComments = commentsRes.ok ? await commentsRes.json() : [];
  const reviewComments = reviewCommentsRes.ok ? await reviewCommentsRes.json() : [];

  const diffRes = await githubAppFetch(`/repos/${owner}/${repo}/pulls/${number}`, {
    installationId,
    headers: { Accept: "application/vnd.github.v3.diff" },
  });
  const diff = diffRes.ok ? await diffRes.text() : "";

  const threads = await fetchReviewThreads(installationId, owner, repo, Number(number));

  return c.json({
    pullRequest,
    files,
    issueComments,
    reviewComments,
    diff,
    reviewThreads: threads,
  });
});

prActionRoutes.post("/:owner/:repo/:number/review", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = c.req.param("number");
  const installationId = await resolveInstallationId(user.id, owner, repo);
  if (!installationId) {
    return c.json({ error: "Repository not accessible" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || (body.event !== "APPROVE" && body.event !== "COMMENT")) {
    return c.json({ error: "event must be APPROVE or COMMENT" }, 400);
  }

  const payload: Record<string, unknown> = {
    event: body.event,
    body: typeof body.body === "string" ? body.body : "",
  };

  if (typeof body.commit_id === "string" && body.commit_id.trim()) {
    payload.commit_id = body.commit_id.trim();
  }

  if (Array.isArray(body.comments)) {
    payload.comments = body.comments.map((comment: Record<string, unknown>) => ({
      path: comment.path,
      line: comment.line,
      body: comment.body,
      side: typeof comment.side === "string" ? comment.side : "RIGHT",
    }));
  }

  const response = await githubAppFetch(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return c.json({ error: text || "Failed to submit review" }, response.status as 400);
  }

  return c.json(await response.json());
});

prActionRoutes.post("/:owner/:repo/:number/review-comments", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = c.req.param("number");
  const installationId = await resolveInstallationId(user.id, owner, repo);
  if (!installationId) {
    return c.json({ error: "Repository not accessible" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.body !== "string" ||
    typeof body.commit_id !== "string" ||
    typeof body.path !== "string" ||
    typeof body.line !== "number"
  ) {
    return c.json({ error: "body, commit_id, path, and line are required" }, 400);
  }

  const payload = {
    body: body.body,
    commit_id: body.commit_id,
    path: body.path,
    line: body.line,
    side: typeof body.side === "string" ? body.side : "RIGHT",
  };

  const response = await githubAppFetch(`/repos/${owner}/${repo}/pulls/${number}/comments`, {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return c.json({ error: text || "Failed to post review comment" }, response.status as 400);
  }

  return c.json(await response.json());
});

prActionRoutes.post("/:owner/:repo/:number/comments/:commentId/reply", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = c.req.param("number");
  const commentId = c.req.param("commentId");
  const installationId = await resolveInstallationId(user.id, owner, repo);
  if (!installationId) {
    return c.json({ error: "Repository not accessible" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.body !== "string") {
    return c.json({ error: "body is required" }, 400);
  }

  const response = await githubAppFetch(
    `/repos/${owner}/${repo}/pulls/${number}/comments/${commentId}/replies`,
    {
      method: "POST",
      installationId,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.body }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return c.json({ error: text || "Failed to reply to comment" }, response.status as 400);
  }

  return c.json(await response.json());
});

prActionRoutes.post("/:owner/:repo/:number/issue-comments", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = c.req.param("number");
  const installationId = await resolveInstallationId(user.id, owner, repo);
  if (!installationId) {
    return c.json({ error: "Repository not accessible" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.body !== "string") {
    return c.json({ error: "body is required" }, 400);
  }

  const response = await githubAppFetch(`/repos/${owner}/${repo}/issues/${number}/comments`, {
    method: "POST",
    installationId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: body.body }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return c.json({ error: text || "Failed to post comment" }, response.status as 400);
  }

  return c.json(await response.json());
});

async function fetchReviewThreads(
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

async function resolveReviewThread(
  installationId: string,
  threadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
    return { ok: false, error: text || "Failed to resolve thread" };
  }

  return { ok: true };
}
