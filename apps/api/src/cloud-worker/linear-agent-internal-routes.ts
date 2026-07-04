import { Hono } from "hono";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import {
  claimLinearAgentRun,
  getLinearAgentRunForOrg,
  listActiveLinearAgentRunsForWorker,
  listPendingLinearAgentRuns,
  listPendingLinearAgentRunsForOrg,
  updateLinearAgentRunStatus,
  updateLinearAgentSessionStatus,
} from "../linear/linear-agent-db.js";
import {
  buildLinearAgentRunWorkspaceContext,
  getLinearAgentIssueWorkspace,
  releaseIssueWorkspaceAfterRun,
} from "../linear/linear-agent-issue-workspace-db.js";
import {
  emitLinearAgentActivity,
  emitLinearAgentRunMilestone,
  type LinearAgentActivityContent,
} from "../linear/linear-agent-activities.js";
import { processLinearAgentRunEventsForActivities } from "../linear/linear-agent-activity-stream.js";
import {
  appendLinearAgentRunEvents,
  LinearAgentRunEventsError,
} from "./linear-agent-run-events-db.js";
import { requireCloudWorkerAuth } from "./internal-auth.js";

const db = createDb(env.databaseUrl());

export const linearAgentInternalRoutes = new Hono();

function mapAgentRun(run: NonNullable<Awaited<ReturnType<typeof getLinearAgentRunForOrg>>>) {
  return {
    id: run.id,
    organizationId: run.organizationId,
    userId: run.userId,
    sessionId: run.sessionId,
    mappingId: run.mappingId,
    projectSourceControlConnectionId: run.projectSourceControlConnectionId,
    connectionId: run.connectionId,
    provider: run.provider,
    namespace: run.namespace,
    repoName: run.repoName,
    trigger: run.trigger,
    payload: run.payload,
    status: run.status,
    linearIssueId: run.linearIssueId,
    runnerKind: run.runnerKind,
    createdAt: run.createdAt,
  };
}

function parseActivityContent(body: unknown): LinearAgentActivityContent | null {
  if (!body || typeof body !== "object") return null;
  const content = (body as { content?: unknown }).content;
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  if (typeof record.type !== "string") return null;

  switch (record.type) {
    case "thought":
      return typeof record.body === "string"
        ? { type: "thought", body: record.body }
        : null;
    case "action":
      return typeof record.action === "string"
        ? {
            type: "action",
            action: record.action,
            ...(typeof record.parameter === "string" ? { parameter: record.parameter } : {}),
            ...(typeof record.result === "string" ? { result: record.result } : {}),
          }
        : null;
    case "response":
      return typeof record.body === "string"
        ? { type: "response", body: record.body }
        : null;
    case "error":
      return typeof record.body === "string" ? { type: "error", body: record.body } : null;
    default:
      return null;
  }
}

linearAgentInternalRoutes.get("/pending", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const organizationId = c.req.query("organizationId")?.trim();
  if (organizationId) {
    const runs = await listPendingLinearAgentRunsForOrg(db, organizationId);
    return c.json({ runs: runs.map(mapAgentRun) });
  }

  const runs = await listPendingLinearAgentRuns(db);
  return c.json({ runs: runs.map(mapAgentRun) });
});

linearAgentInternalRoutes.get("/active", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runnerInstanceId = c.req.query("runnerInstanceId")?.trim();
  if (!runnerInstanceId) {
    return c.json({ error: "runnerInstanceId is required" }, 400);
  }

  const runs = await listActiveLinearAgentRunsForWorker(db, runnerInstanceId);
  return c.json({ runs: runs.map(mapAgentRun) });
});

linearAgentInternalRoutes.get("/:id", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const organizationId = c.req.query("organizationId")?.trim();
  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const run = await getLinearAgentRunForOrg(db, organizationId, runId);
  if (!run) return c.json({ error: "Not found" }, 404);

  const workspaceModeEnv = c.req.query("workspaceMode")?.trim() ?? null;
  const workspace = await buildLinearAgentRunWorkspaceContext(db, organizationId, run, {
    workspaceModeEnv,
  });

  return c.json({ run: { ...mapAgentRun(run), workspace } });
});

linearAgentInternalRoutes.post("/:id/claim", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const organizationId =
    body && typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const claimedBy =
    body && typeof body.claimedBy === "string" ? body.claimedBy.trim() : "";
  const runnerInstanceId =
    body && typeof body.runnerInstanceId === "string" ? body.runnerInstanceId.trim() : "";

  if (!organizationId || !runnerInstanceId) {
    return c.json({ error: "organizationId and runnerInstanceId are required" }, 400);
  }

  const run = await claimLinearAgentRun(db, {
    runId,
    organizationId,
    claimedBy,
    runnerInstanceId,
  });
  if (!run) return c.json({ error: "Run not available" }, 409);
  return c.json({ run: mapAgentRun(run) });
});

linearAgentInternalRoutes.post("/:id/activities", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const organizationId =
    body && typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const content = parseActivityContent(body);
  if (!content) {
    return c.json({ error: "content is required" }, 400);
  }

  await emitLinearAgentActivity(db, organizationId, runId, content, {
    ephemeral: body?.ephemeral === true,
  });
  return c.json({ ok: true });
});

linearAgentInternalRoutes.post("/:id/events", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const organizationId =
    body && typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const events = Array.isArray(body?.events)
    ? body.events
    : body?.event !== undefined
      ? [body.event]
      : [];
  if (events.length === 0) {
    return c.json({ error: "events is required" }, 400);
  }

  try {
    const result = await appendLinearAgentRunEvents(db, organizationId, runId, events);
    await processLinearAgentRunEventsForActivities(db, organizationId, runId, events);
    return c.json(result);
  } catch (err) {
    if (err instanceof LinearAgentRunEventsError) {
      const status = err.code === "RUN_NOT_FOUND" ? 404 : 409;
      return c.json({ error: err.message }, status);
    }
    throw err;
  }
});

linearAgentInternalRoutes.post("/:id/workspace/complete", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const organizationId =
    body && typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const run = await getLinearAgentRunForOrg(db, organizationId, runId);
  if (!run?.linearIssueId?.trim()) {
    return c.json({ error: "Run has no issue workspace" }, 404);
  }

  await releaseIssueWorkspaceAfterRun(db, {
    organizationId,
    linearIssueId: run.linearIssueId.trim(),
    runId,
    worktreePath: typeof body?.worktreePath === "string" ? body.worktreePath : null,
    workBranch: typeof body?.workBranch === "string" ? body.workBranch : null,
    piAgentDir: typeof body?.piAgentDir === "string" ? body.piAgentDir : null,
    piSessionPath: typeof body?.piSessionPath === "string" ? body.piSessionPath : null,
    success: body?.success !== false,
  });

  return c.json({ ok: true });
});

linearAgentInternalRoutes.post("/:id/status", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const organizationId =
    body && typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }
  if (!body || typeof body.status !== "string") {
    return c.json({ error: "status is required" }, 400);
  }

  const status = body.status;
  if (status !== "running" && status !== "done" && status !== "failed") {
    return c.json({ error: "Invalid status" }, 400);
  }

  const existing = await getLinearAgentRunForOrg(db, organizationId, runId);

  await updateLinearAgentRunStatus(db, runId, organizationId, status, {
    errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined,
    resultMarkdown: typeof body.resultMarkdown === "string" ? body.resultMarkdown : undefined,
  });

  if (status === "done") {
    await emitLinearAgentRunMilestone(db, organizationId, runId, "done", {
      resultMarkdown:
        typeof body.resultMarkdown === "string" ? body.resultMarkdown : undefined,
    });
    if (existing?.sessionId) {
      await updateLinearAgentSessionStatus(db, existing.sessionId, organizationId, "complete");
    }
  } else if (status === "failed") {
    await emitLinearAgentRunMilestone(db, organizationId, runId, "failed", {
      errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined,
    });
    if (existing?.sessionId) {
      await updateLinearAgentSessionStatus(db, existing.sessionId, organizationId, "error");
    }
  }

  if (
    (status === "done" || status === "failed") &&
    existing?.linearIssueId?.trim() &&
    existing.runnerKind === "issue_workspace"
  ) {
    const issueWorkspace = await getLinearAgentIssueWorkspace(
      db,
      organizationId,
      existing.linearIssueId.trim(),
    );
    if (issueWorkspace?.status === "busy") {
      await releaseIssueWorkspaceAfterRun(db, {
        organizationId,
        linearIssueId: existing.linearIssueId.trim(),
        runId,
        success: status === "done",
      });
    }
  }

  return c.json({ ok: true });
});
