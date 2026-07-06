import { createDb } from "@openharness/db";
import { Hono, type Context } from "hono";
import { and, eq, sql } from "@openharness/db";
import { projectSourceControlConnection, workflowSetting } from "@openharness/db/schema";
import { Result } from "better-result";
import { env } from "../env.js";
import { GithubApiError, type InfrastructureError } from "../errors.js";
import {
  mapGithubApiError,
  respondFromGithubResultJson,
  respondFromInfrastructureResultJson,
  respondFromResult,
} from "../result-helpers.js";
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
import {
  githubCreateInlineComment,
  githubFetchGitCredentials,
  githubFetchPrContext,
  githubPostIssueComment,
  githubReplyToThread,
  githubResolveThread,
  githubSubmitReview,
} from "../source-control/github-pr-service.js";
import { resolveGithubInstallationId } from "../source-control/github-adapter.js";
import type { SubmitReviewInput } from "../source-control/pr-context.js";

const db = createDb(env.databaseUrl());

function repoNotAccessibleError(): GithubApiError {
  return new GithubApiError({ message: "Repository not accessible", status: 403 });
}

async function withGithubInstallation(
  organizationId: string,
  owner: string,
  repo: string,
): Promise<Result<string, GithubApiError>> {
  const installationId = await resolveGithubInstallationId(organizationId, owner, repo);
  if (!installationId) return Result.err(repoNotAccessibleError());
  return Result.ok(installationId);
}

async function withGithubInstallationAction<T>(
  organizationId: string,
  owner: string,
  repo: string,
  action: (installationId: string) => Promise<Result<T, GithubApiError>>,
): Promise<Result<T, GithubApiError>> {
  return Result.gen(async function* () {
    const installationId = yield* Result.await(withGithubInstallation(organizationId, owner, repo));
    const value = yield* Result.await(action(installationId));
    return Result.ok(value);
  });
}

function respondGithubOk(c: Context, result: Result<void, GithubApiError>) {
  return respondFromResult(c, result, mapGithubApiError, { success: () => c.json({ ok: true }) });
}

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
): Promise<Result<string, InfrastructureError>> {
  const connectionId = await upsertOrgRepoConnection(db, organizationId, userId, {
    provider: "github",
    owner: input.owner,
    repo: input.repo,
    remoteUrl: input.remoteUrl,
    externalRepoId: input.githubRepoId,
    connectionId: input.connectionId,
    installationId: input.installationId,
  });

  const bindingResult = await upsertRunnerBinding(db, organizationId, userId, {
    runnerInstanceId: input.runnerInstanceId,
    connectionId,
    projectPath: input.projectPath,
  });
  if (Result.isError(bindingResult)) return Result.err(bindingResult.error);

  return Result.ok(connectionId);
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

  const connectionResult = await upsertProjectGithubConnection(org.organizationId, user.id, {
    projectPath: body.projectPath,
    runnerInstanceId: body.runnerInstanceId.trim(),
    owner: body.owner,
    repo: body.repo,
    remoteUrl,
    githubRepoId: repoRecord.githubRepoId,
    installationId: repoRecord.installationId,
    connectionId: repoRecord.connectionId,
  });
  if (Result.isError(connectionResult)) {
    return respondFromInfrastructureResultJson(c, connectionResult);
  }
  const connectionId = connectionResult.value;

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

  const settingResult = await upsertWorkflowSetting(
    db,
    org.organizationId,
    user.id,
    connectionId,
    body.workflowType as WorkflowType,
    true,
  );
  if (Result.isError(settingResult)) {
    return respondFromInfrastructureResultJson(c, settingResult);
  }

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

  const settingResult = await upsertWorkflowSetting(
    db,
    org.organizationId,
    user.id,
    body.connectionId,
    body.workflowType as WorkflowType,
    body.enabled,
  );
  if (Result.isError(settingResult)) {
    return respondFromInfrastructureResultJson(c, settingResult);
  }

  const workflows = await listUserWorkflowInstances(db, org.organizationId);
  return c.json({ ok: true, workflows });
});

export const prActionRoutes = new Hono<{ Variables: AppVariables }>();

prActionRoutes.get("/:owner/:repo/git-credentials", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const result = await withGithubInstallationAction(
    org.organizationId,
    owner,
    repo,
    (installationId) => githubFetchGitCredentials(installationId, owner, repo),
  );

  return respondFromGithubResultJson(c, result);
});

prActionRoutes.post("/:owner/:repo/threads/:threadId/resolve", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const threadId = c.req.param("threadId");

  const result = await withGithubInstallationAction(org.organizationId, owner, repo, (installationId) =>
    githubResolveThread(installationId, threadId),
  );

  return respondGithubOk(c, result);
});

prActionRoutes.get("/:owner/:repo/:number/context", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);

  const result = await withGithubInstallationAction(org.organizationId, owner, repo, (installationId) =>
    githubFetchPrContext(installationId, owner, repo, number),
  );

  return respondFromGithubResultJson(c, result);
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

  const result = await withGithubInstallationAction(org.organizationId, owner, repo, (installationId) =>
    githubSubmitReview(installationId, owner, repo, number, input),
  );

  return respondGithubOk(c, result);
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

  const result = await withGithubInstallationAction(org.organizationId, owner, repo, (installationId) =>
    githubCreateInlineComment(installationId, owner, repo, number, {
      body: body.body,
      path: body.path,
      line: body.line,
      side: body.side === "LEFT" ? "LEFT" : "RIGHT",
      commitId: body.commit_id,
    }),
  );

  return respondGithubOk(c, result);
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

  const result = await withGithubInstallationAction(org.organizationId, owner, repo, (installationId) =>
    githubReplyToThread(installationId, owner, repo, number, commentId, body.body),
  );

  return respondGithubOk(c, result);
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

  const result = await withGithubInstallationAction(org.organizationId, owner, repo, (installationId) =>
    githubPostIssueComment(installationId, owner, repo, number, body.body),
  );

  return respondGithubOk(c, result);
});
