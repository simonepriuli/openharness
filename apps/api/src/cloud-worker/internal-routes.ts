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
import { notifyDiscordWorkflowResult } from "../discord/discord-notify.js";
import { findChannelMappingForRepo } from "../teams/teams-db.js";
import { notifyTeamsWorkflowResult } from "../teams/teams-notify.js";
import { teamsInstallation } from "@openharness/db/schema";
import { eq } from "@openharness/db";
import { workflowRun } from "@openharness/db/schema";
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

  if (status === "done" || status === "failed") {
    const assistantText =
      typeof body.teamsAssistantText === "string" ? body.teamsAssistantText : "";

    const runs = await db
      .select()
      .from(workflowRun)
      .where(eq(workflowRun.id, runId))
      .limit(1);
    const run = runs[0];
    if (run) {
      const payload = run.payload as {
        workflow?: { name?: string; tools?: { teamsNotify?: boolean; discordNotify?: boolean } };
        teams?: { tenantId?: string; replyToActivityId?: string };
        discord?: { replyToMessageId?: string };
      };
      const tools = payload.workflow?.tools;
      if (tools?.teamsNotify) {
        const mapping = await findChannelMappingForRepo(
          db,
          organizationId,
          run.namespace,
          run.repoName,
        );
        const tenantId =
          payload.teams?.tenantId ??
          (mapping
            ? (
                await db
                  .select({ tenantId: teamsInstallation.tenantId })
                  .from(teamsInstallation)
                  .where(eq(teamsInstallation.id, mapping.installationId))
                  .limit(1)
              )[0]?.tenantId
            : undefined);
        if (tenantId) {
          await notifyTeamsWorkflowResult(db, {
            organizationId,
            owner: run.namespace,
            repo: run.repoName,
            tenantId,
            assistantText,
            workflowName: payload.workflow?.name,
            failed: status === "failed",
            errorMessage:
              typeof body.errorMessage === "string" ? body.errorMessage : undefined,
            replyToActivityId: payload.teams?.replyToActivityId,
          }).catch((err) => console.error("[internal/workflow-runs/status] teams notify failed", err));
        }
      }
      if (tools?.discordNotify) {
        const botToken = env.discordBotToken();
        if (!botToken) {
          console.error(
            "[internal/workflow-runs/status] discord notify skipped: DISCORD_BOT_TOKEN is not set",
          );
        } else {
          await notifyDiscordWorkflowResult(db, {
            botToken,
            organizationId,
            owner: run.namespace,
            repo: run.repoName,
            assistantText,
            workflowName: payload.workflow?.name,
            failed: status === "failed",
            errorMessage:
              typeof body.errorMessage === "string" ? body.errorMessage : undefined,
            replyToMessageId: payload.discord?.replyToMessageId,
          }).catch((err) =>
            console.error("[internal/workflow-runs/status] discord notify failed", err),
          );
        }
      }
    }
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
