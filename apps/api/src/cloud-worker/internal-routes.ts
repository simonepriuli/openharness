import { Hono } from "hono";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import {
  claimCloudWorkflowRun,
  getWorkflowRunExecutionForOrg,
  listActiveCloudRunsForWorker,
  listAllPendingCloudRuns,
  listPendingCloudRunsForOrg,
  updateWorkflowRunStatus,
} from "../github/workflow-db.js";
import type { WorkflowRunResultPayload } from "../github/workflow-types.js";
import {
  notifyWorkflowRunFailure,
  postWorkflowRunDiscordNotify,
  postWorkflowRunTeamsNotify,
} from "../workflow-notify-handler.js";
import { requireCloudWorkerAuth } from "./internal-auth.js";
import {
  WorkflowRunEventsError,
  appendWorkflowRunEvents,
} from "./workflow-run-events-db.js";

const db = createDb(env.databaseUrl());

export const cloudWorkerInternalRoutes = new Hono();

function mapExecutionRun(run: {
  id: string;
  workflowId: string | null;
  workflowType: string | null;
  projectSourceControlConnectionId: string | null;
  projectPath: string | null;
  provider: string;
  namespace: string;
  repoName: string;
  prNumber: number;
  event: string;
  iteration: number;
  payload: unknown;
  createdAt: Date;
}) {
  return {
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
  };
}

function mapPendingRun(run: {
  id: string;
  organizationId: string;
  workflowId: string | null;
  workflowType: string | null;
  projectSourceControlConnectionId: string | null;
  provider: string;
  namespace: string;
  repoName: string;
  prNumber: number;
  event: string;
  iteration: number;
  payload: unknown;
  resolvedExecutor: string | null;
  createdAt: Date;
}) {
  return {
    id: run.id,
    organizationId: run.organizationId,
    workflowId: run.workflowId,
    workflowType: run.workflowType,
    projectSourceControlConnectionId: run.projectSourceControlConnectionId,
    provider: run.provider,
    namespace: run.namespace,
    repoName: run.repoName,
    prNumber: run.prNumber,
    event: run.event,
    iteration: run.iteration,
    payload: run.payload,
    resolvedExecutor: run.resolvedExecutor,
    createdAt: run.createdAt,
  };
}

cloudWorkerInternalRoutes.get("/pending", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const organizationId = c.req.query("organizationId")?.trim();
  if (organizationId) {
    const runs = await listPendingCloudRunsForOrg(db, organizationId);
    return c.json({ runs: runs.map(mapPendingRun) });
  }

  const runs = await listAllPendingCloudRuns(db);
  return c.json({ runs: runs.map(mapPendingRun) });
});

cloudWorkerInternalRoutes.get("/active", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runnerInstanceId = c.req.query("runnerInstanceId")?.trim();
  if (!runnerInstanceId) {
    return c.json({ error: "runnerInstanceId is required" }, 400);
  }

  const runs = await listActiveCloudRunsForWorker(db, runnerInstanceId);
  return c.json({ runs });
});

cloudWorkerInternalRoutes.post("/sandboxes/stop", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const sandboxId =
    body && typeof body.sandboxId === "string" ? body.sandboxId.trim() : "";
  if (!sandboxId) {
    return c.json({ error: "sandboxId is required" }, 400);
  }

  try {
    const { stopDispatchedSandbox } = await import("./stop-sandbox.js");
    await stopDispatchedSandbox(sandboxId);
    console.log("[cloud-worker/internal] stopped sandbox", { sandboxId });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cloud-worker/internal] sandbox stop failed", sandboxId, message);
    return c.json({ error: message }, 500);
  }
});

cloudWorkerInternalRoutes.get("/:id", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const organizationId = c.req.query("organizationId")?.trim();
  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }

  const run = await getWorkflowRunExecutionForOrg(db, organizationId, runId);
  if (!run) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ run: mapExecutionRun(run) });
});

cloudWorkerInternalRoutes.post("/:id/claim", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const organizationId =
    body && typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const claimedBy =
    body && typeof body.claimedBy === "string" && body.claimedBy.trim()
      ? body.claimedBy.trim()
      : null;
  const runnerInstanceId =
    body && typeof body.runnerInstanceId === "string" && body.runnerInstanceId.trim()
      ? body.runnerInstanceId.trim()
      : claimedBy;

  if (!organizationId) {
    return c.json({ error: "organizationId is required" }, 400);
  }
  if (!claimedBy) {
    return c.json({ error: "claimedBy is required" }, 400);
  }
  if (!runnerInstanceId) {
    return c.json({ error: "runnerInstanceId is required" }, 400);
  }

  const run = await claimCloudWorkflowRun(
    db,
    runId,
    organizationId,
    claimedBy,
    runnerInstanceId,
  );
  if (!run) {
    return c.json({ error: "Run not available for claim" }, 409);
  }

  return c.json({ run });
});

cloudWorkerInternalRoutes.post("/:id/notify/discord", async (c) => {
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

  const summary = body && typeof body.summary === "string" ? body.summary : "";
  const result = await postWorkflowRunDiscordNotify(db, organizationId, runId, summary);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ ok: true });
});

cloudWorkerInternalRoutes.post("/:id/notify/teams", async (c) => {
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

  const summary = body && typeof body.summary === "string" ? body.summary : "";
  const result = await postWorkflowRunTeamsNotify(db, organizationId, runId, summary);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json({ ok: true });
});

cloudWorkerInternalRoutes.post("/:id/status", async (c) => {
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

  await updateWorkflowRunStatus(db, runId, organizationId, status, {
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
    const sandboxId =
      body && typeof body.sandboxId === "string" ? body.sandboxId.trim() : "";
    if (sandboxId) {
      const { stopDispatchedSandbox } = await import("./stop-sandbox.js");
      await stopDispatchedSandbox(sandboxId).catch((err) =>
        console.error("[internal/workflow-runs/status] sandbox stop failed", sandboxId, err),
      );
    }

    await notifyWorkflowRunFailure(
      db,
      organizationId,
      runId,
      typeof body.errorMessage === "string" ? body.errorMessage : undefined,
    );
  }

  return c.json({ ok: true });
});

cloudWorkerInternalRoutes.post("/:id/events", async (c) => {
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
    const result = await appendWorkflowRunEvents(db, organizationId, runId, events);
    return c.json(result);
  } catch (err) {
    if (err instanceof WorkflowRunEventsError) {
      const status =
        err.code === "RUN_NOT_FOUND" ? 404 : err.code === "RUN_NOT_ACTIVE" ? 409 : 400;
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }
});
