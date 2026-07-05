import { Hono } from "hono";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import {
  claimWorkflowRun,
  dismissWorkflowRunForOrg,
  getWorkflowRunForOrg,
  getWorkflowRunExecutionForOrg,
  getWorkflowRunStats,
  listActiveRunsForRunner,
  listPendingRunsForOrg,
  listWorkflowRunsForOrg,
  updateWorkflowRunStatus,
} from "../github/workflow-db.js";
import type { WorkflowRunResultPayload } from "../github/workflow-types.js";
import {
  appendWorkflowRunEvents,
  listWorkflowRunEvents,
} from "../cloud-worker/workflow-run-events-db.js";
import {
  respondFromNotifyResult,
  respondFromRunEventsResult,
} from "../result-helpers.js";
import {
  heartbeatRunnerBindings,
  getRunnerUserId,
  listBoundConnectionIdsForRunner,
} from "../github/runner-bindings-db.js";
import {
  notifyWorkflowRunFailure,
  postWorkflowRunDiscordNotify,
  postWorkflowRunTeamsNotify,
} from "../workflow-notify-handler.js";

const db = createDb(env.databaseUrl());

export const workflowRunRoutes = new Hono<{ Variables: AppVariables }>();

workflowRunRoutes.get("/", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const workflowId = c.req.query("workflowId") ?? undefined;
  const limit = Number.parseInt(c.req.query("limit") ?? "25", 10) || 25;
  const cursor = c.req.query("cursor") ?? undefined;
  const result = await listWorkflowRunsForOrg(
    db,
    org.organizationId,
    { workflowId, limit, cursor },
    user.id,
  );
  return c.json(result);
});

workflowRunRoutes.get("/stats", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const workflowId = c.req.query("workflowId") ?? undefined;
  const stats = await getWorkflowRunStats(db, org.organizationId, workflowId, user.id);
  return c.json({ stats });
});

workflowRunRoutes.get("/pending", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runnerInstanceId = c.req.query("runnerInstanceId")?.trim();
  if (!runnerInstanceId) {
    return c.json({ error: "runnerInstanceId is required" }, 400);
  }

  await heartbeatRunnerBindings(db, org.organizationId, runnerInstanceId);

  const connectionIds = await listBoundConnectionIdsForRunner(
    db,
    org.organizationId,
    runnerInstanceId,
  );
  const runnerUserId = await getRunnerUserId(db, org.organizationId, runnerInstanceId);
  const pendingRuns =
    connectionIds.length === 0 || !runnerUserId
      ? []
      : await listPendingRunsForOrg(db, org.organizationId, {
          connectionIds,
          runnerUserId,
        });

  return c.json({
    runs: pendingRuns.map((run) => ({
      id: run.id,
      workflowId: run.workflowId,
      workflowType: run.workflowType,
      projectSourceControlConnectionId: run.projectSourceControlConnectionId,
      projectPath: run.projectPath,
      provider: run.provider,
      githubOwner: run.namespace,
      githubRepo: run.repoName,
      namespace: run.namespace,
      repoName: run.repoName,
      prNumber: run.prNumber,
      event: run.event,
      iteration: run.iteration,
      payload: run.payload,
      createdAt: run.createdAt,
    })),
  });
});

workflowRunRoutes.get("/active", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runnerInstanceId = c.req.query("runnerInstanceId")?.trim();
  if (!runnerInstanceId) {
    return c.json({ error: "runnerInstanceId is required" }, 400);
  }

  await heartbeatRunnerBindings(db, org.organizationId, runnerInstanceId);

  const runs = await listActiveRunsForRunner(db, org.organizationId, runnerInstanceId);
  return c.json({ runs });
});

workflowRunRoutes.get("/:id/events", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const runId = c.req.param("id");
  const run = await getWorkflowRunForOrg(db, org.organizationId, runId, user.id);
  if (!run) return c.json({ error: "Not found" }, 404);

  const afterSeqRaw = c.req.query("afterSeq");
  const afterSeq =
    afterSeqRaw !== undefined && afterSeqRaw !== ""
      ? Number.parseInt(afterSeqRaw, 10)
      : undefined;
  const limitRaw = c.req.query("limit");
  const limit = limitRaw !== undefined && limitRaw !== "" ? Number.parseInt(limitRaw, 10) : undefined;

  const result = await listWorkflowRunEvents(db, org.organizationId, runId, {
    afterSeq: Number.isFinite(afterSeq) ? afterSeq : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return c.json(result);
});

workflowRunRoutes.post("/:id/events", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const runId = c.req.param("id");
  const run = await getWorkflowRunForOrg(db, org.organizationId, runId, user.id);
  if (!run) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json().catch(() => null);
  const events = Array.isArray(body?.events)
    ? body.events
    : body?.event !== undefined
      ? [body.event]
      : [];
  if (events.length === 0) {
    return c.json({ error: "events is required" }, 400);
  }

  const result = await appendWorkflowRunEvents(db, org.organizationId, runId, events);
  return respondFromRunEventsResult(c, result);
});

workflowRunRoutes.get("/:id/execution", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const runId = c.req.param("id");
  const visible = await getWorkflowRunForOrg(db, org.organizationId, runId, user.id);
  if (!visible) return c.json({ error: "Not found" }, 404);

  const run = await getWorkflowRunExecutionForOrg(db, org.organizationId, runId);
  if (!run) return c.json({ error: "Not found" }, 404);

  return c.json({
    run: {
      id: run.id,
      workflowId: run.workflowId,
      workflowType: run.workflowType,
      projectSourceControlConnectionId: run.projectSourceControlConnectionId,
      projectPath: run.projectPath,
      provider: run.provider,
      namespace: run.namespace,
      repoName: run.repoName,
      githubOwner: run.namespace,
      githubRepo: run.repoName,
      prNumber: run.prNumber,
      event: run.event,
      iteration: run.iteration,
      payload: run.payload,
      createdAt: run.createdAt.toISOString(),
    },
  });
});

workflowRunRoutes.get("/:id", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const runId = c.req.param("id");
  const run = await getWorkflowRunForOrg(db, org.organizationId, runId, user.id);
  if (!run) return c.json({ error: "Not found" }, 404);

  return c.json({ run });
});

workflowRunRoutes.post("/:id/dismiss", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const reason =
    body && typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "Marked as failed";

  const result = await dismissWorkflowRunForOrg(
    db,
    org.organizationId,
    runId,
    user.id,
    reason,
  );
  if (result === null) return c.json({ error: "Not found" }, 404);
  if (result === "not_active") {
    return c.json({ error: "Run is not in an active state" }, 409);
  }

  return c.json({ run: result });
});

workflowRunRoutes.post("/:id/claim", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const claimedBy =
    body && typeof body.claimedBy === "string" && body.claimedBy.trim()
      ? body.claimedBy.trim()
      : null;
  const runnerInstanceId =
    body && typeof body.runnerInstanceId === "string" && body.runnerInstanceId.trim()
      ? body.runnerInstanceId.trim()
      : claimedBy;

  if (!claimedBy) {
    return c.json({ error: "claimedBy is required" }, 400);
  }
  if (!runnerInstanceId) {
    return c.json({ error: "runnerInstanceId is required" }, 400);
  }

  const run = await claimWorkflowRun(
    db,
    runId,
    org.organizationId,
    claimedBy,
    runnerInstanceId,
  );
  if (!run) {
    return c.json({ error: "Run not available for claim" }, 409);
  }

  return c.json({ run });
});

workflowRunRoutes.post("/:id/notify/discord", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const summary = body && typeof body.summary === "string" ? body.summary : "";
  const result = await postWorkflowRunDiscordNotify(db, org.organizationId, runId, summary);
  return respondFromNotifyResult(c, result);
});

workflowRunRoutes.post("/:id/notify/teams", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const summary = body && typeof body.summary === "string" ? body.summary : "";
  const result = await postWorkflowRunTeamsNotify(db, org.organizationId, runId, summary);
  return respondFromNotifyResult(c, result);
});

workflowRunRoutes.post("/:id/status", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.status !== "string") {
    return c.json({ error: "status is required" }, 400);
  }

  const status = body.status;
  if (status !== "running" && status !== "done" && status !== "failed") {
    return c.json({ error: "Invalid status" }, 400);
  }

  await updateWorkflowRunStatus(db, runId, org.organizationId, status, {
    errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined,
    iteration: typeof body.iteration === "number" ? body.iteration : undefined,
    resultMarkdown: typeof body.resultMarkdown === "string" ? body.resultMarkdown : undefined,
    resultPayload:
      body.resultPayload && typeof body.resultPayload === "object"
        ? (body.resultPayload as WorkflowRunResultPayload)
        : body.resultPayload === null
          ? null
          : undefined,
  });

  if (status === "failed") {
    await notifyWorkflowRunFailure(
      db,
      org.organizationId,
      runId,
      typeof body.errorMessage === "string" ? body.errorMessage : undefined,
    );
  }

  return c.json({ ok: true });
});
