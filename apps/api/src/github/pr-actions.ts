import { createDb } from "@openharness/db";
import { Hono } from "hono";
import { and, eq, sql } from "@openharness/db";
import { projectSourceControlConnection, workflowSetting } from "@openharness/db/schema";
import { env } from "../env.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import { findRepoInOrgInstallations, remoteMismatchWarning } from "./sync.js";
import {
  upsertOrgRepoConnection,
  upsertRunnerBinding,
} from "./runner-bindings-db.js";
import {
  listUserWorkflowInstances,
  upsertWorkflowSetting,
} from "./workflow-db.js";
import { DEFAULT_WORKFLOW_DEFINITIONS, type WorkflowType } from "./workflow-constants.js";
import { getSourceControlProvider } from "../source-control/registry.js";
import type { SubmitReviewInput } from "../source-control/pr-context.js";

const db = createDb(env.databaseUrl());
const githubProvider = () => getSourceControlProvider("github");

export const workflowSettingsRoutes = new Hono<{ Variables: AppVariables }>();

async function upsertProjectGithubConnection(
  organizationId: string,
  userId: string,
  input: {
    projectPath: string;
    runnerInstanceId: string;
    owner: string;
    repo: string;
    remoteUrl: string | null;
    githubRepoId: string;
    installationId: string;
    connectionId: string;
  },
): Promise<string> {
  const connectionId = await upsertOrgRepoConnection(db, organizationId, userId, {
    provider: "github",
    owner: input.owner,
    repo: input.repo,
    remoteUrl: input.remoteUrl,
    externalRepoId: input.githubRepoId,
    connectionId: input.connectionId,
    installationId: input.installationId,
  });

  await upsertRunnerBinding(db, organizationId, userId, {
    runnerInstanceId: input.runnerInstanceId,
    connectionId,
    projectPath: input.projectPath,
  });

  return connectionId;
}

workflowSettingsRoutes.get("/", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const workflows = await listUserWorkflowInstances(db, org.organizationId);
  return c.json({
    templates: DEFAULT_WORKFLOW_DEFINITIONS,
    workflows,
  });
});

workflowSettingsRoutes.post("/create", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.projectPath !== "string" ||
    typeof body.runnerInstanceId !== "string" ||
    typeof body.owner !== "string" ||
    typeof body.repo !== "string" ||
    typeof body.workflowType !== "string"
  ) {
    return c.json(
      { error: "projectPath, runnerInstanceId, owner, repo, and workflowType are required" },
      400,
    );
  }

  if (body.workflowType !== "pr_review" && body.workflowType !== "comment_fixer") {
    return c.json({ error: "Invalid workflowType" }, 400);
  }

  const remoteUrl = typeof body.remoteUrl === "string" ? body.remoteUrl : null;
  const repoRecord = await findRepoInOrgInstallations(db, org.organizationId, body.owner, body.repo);
  if (!repoRecord) {
    return c.json(
      {
        error: "repo_not_accessible",
        message: "Install the OpenHarness GitHub App on this repository first.",
      },
      403,
    );
  }

  const connectionId = await upsertProjectGithubConnection(org.organizationId, user.id, {
    projectPath: body.projectPath,
    runnerInstanceId: body.runnerInstanceId.trim(),
    owner: body.owner,
    repo: body.repo,
    remoteUrl,
    githubRepoId: repoRecord.githubRepoId,
    installationId: repoRecord.installationId,
    connectionId: repoRecord.connectionId,
  });

  const existingForRepo = await db
    .select({ id: workflowSetting.id })
    .from(workflowSetting)
    .innerJoin(
      projectSourceControlConnection,
      eq(workflowSetting.projectSourceControlConnectionId, projectSourceControlConnection.id),
    )
    .where(
      and(
        eq(workflowSetting.organizationId, org.organizationId),
        eq(workflowSetting.workflowType, body.workflowType),
        eq(workflowSetting.enabled, true),
        sql`lower(${projectSourceControlConnection.namespace}) = ${body.owner.toLowerCase()}`,
        sql`lower(${projectSourceControlConnection.name}) = ${body.repo.toLowerCase()}`,
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
    org.organizationId,
    user.id,
    connectionId,
    body.workflowType as WorkflowType,
    true,
  );

  const warning = remoteMismatchWarning(remoteUrl, body.owner, body.repo);
  const workflows = await listUserWorkflowInstances(db, org.organizationId);
  return c.json({ ok: true, warning, workflows });
});

workflowSettingsRoutes.put("/", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) {
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
    .select({ id: projectSourceControlConnection.id })
    .from(projectSourceControlConnection)
    .where(
      and(
        eq(projectSourceControlConnection.id, body.connectionId),
        eq(projectSourceControlConnection.organizationId, org.organizationId),
      ),
    )
    .limit(1);

  if (!connectionRows[0]) {
    return c.json({ error: "Connection not found" }, 404);
  }

  await upsertWorkflowSetting(
    db,
    org.organizationId,
    user.id,
    body.connectionId,
    body.workflowType as WorkflowType,
    body.enabled,
  );

  const workflows = await listUserWorkflowInstances(db, org.organizationId);
  return c.json({ ok: true, workflows });
});

export const prActionRoutes = new Hono<{ Variables: AppVariables }>();

prActionRoutes.get("/:owner/:repo/git-credentials", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  try {
    const credentials = await githubProvider().fetchGitCredentials(org.organizationId, owner, repo);
    return c.json(credentials);
  } catch {
    return c.json({ error: "Repository not accessible" }, 403);
  }
});

prActionRoutes.post("/:owner/:repo/threads/:threadId/resolve", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const threadId = c.req.param("threadId");
  try {
    await githubProvider().resolveThread(org.organizationId, owner, repo, 0, threadId);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve thread";
    return c.json({ error: message }, 400);
  }
});

prActionRoutes.get("/:owner/:repo/:number/context", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  try {
    const context = await githubProvider().fetchPrContext(org.organizationId, owner, repo, number);
    return c.json(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch PR context";
    return c.json({ error: message }, 400);
  }
});

prActionRoutes.post("/:owner/:repo/:number/review", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  const body = await c.req.json().catch(() => null);
  if (!body || (body.event !== "APPROVE" && body.event !== "COMMENT")) {
    return c.json({ error: "event must be APPROVE or COMMENT" }, 400);
  }

  const input: SubmitReviewInput = {
    event: body.event,
    body: typeof body.body === "string" ? body.body : "",
    commitId: typeof body.commit_id === "string" ? body.commit_id : undefined,
    comments: Array.isArray(body.comments)
      ? body.comments.map((comment: Record<string, unknown>) => ({
          path: String(comment.path ?? ""),
          line: Number(comment.line),
          body: String(comment.body ?? ""),
          side: comment.side === "LEFT" ? "LEFT" : "RIGHT",
        }))
      : undefined,
  };

  try {
    await githubProvider().submitReview(org.organizationId, owner, repo, number, input);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit review";
    return c.json({ error: message }, 400);
  }
});

prActionRoutes.post("/:owner/:repo/:number/review-comments", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
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

  try {
    await githubProvider().createInlineComment(org.organizationId, owner, repo, number, {
      body: body.body,
      path: body.path,
      line: body.line,
      side: body.side === "LEFT" ? "LEFT" : "RIGHT",
      commitId: body.commit_id,
    });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to post review comment";
    return c.json({ error: message }, 400);
  }
});

prActionRoutes.post("/:owner/:repo/:number/comments/:commentId/reply", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  const commentId = c.req.param("commentId");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.body !== "string") {
    return c.json({ error: "body is required" }, 400);
  }

  try {
    await githubProvider().replyToThread(org.organizationId, owner, repo, number, commentId, body.body);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reply to comment";
    return c.json({ error: message }, 400);
  }
});

prActionRoutes.post("/:owner/:repo/:number/issue-comments", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.body !== "string") {
    return c.json({ error: "body is required" }, 400);
  }

  try {
    await githubProvider().postIssueComment(org.organizationId, owner, repo, number, body.body);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to post comment";
    return c.json({ error: message }, 400);
  }
});
