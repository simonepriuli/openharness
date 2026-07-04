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
import { emitLinearAgentRunMilestone } from "../linear/linear-agent-activities.js";
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
    createdAt: run.createdAt,
  };
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
  return c.json({ run: mapAgentRun(run) });
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

  if (status === "running") {
    await emitLinearAgentRunMilestone(db, organizationId, runId, "preparing");
    await emitLinearAgentRunMilestone(db, organizationId, runId, "running");
  } else if (status === "done") {
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

  return c.json({ ok: true });
});
