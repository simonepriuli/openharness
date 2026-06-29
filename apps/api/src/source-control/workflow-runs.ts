import { Hono } from "hono";
import { eq } from "@openharness/db";
import { createDb } from "@openharness/db";
import { workflowRun } from "@openharness/db/schema";
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
  WorkflowRunEventsError,
  appendWorkflowRunEvents,
  listWorkflowRunEvents,
} from "../cloud-worker/workflow-run-events-db.js";
import {
  heartbeatRunnerBindings,
  getRunnerUserId,
  listBoundConnectionIdsForRunner,
} from "../github/runner-bindings-db.js";
import { notifyTeamsWorkflowResult } from "../teams/teams-notify.js";
import { findChannelMappingForRepo } from "../teams/teams-db.js";
import { teamsInstallation } from "@openharness/db/schema";
import { notifyDiscordWorkflowResult } from "../discord/discord-notify.js";

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

  try {
    const result = await appendWorkflowRunEvents(db, org.organizationId, runId, events);
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
          org.organizationId,
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
            organizationId: org.organizationId,
            owner: run.namespace,
            repo: run.repoName,
            tenantId,
            assistantText,
            workflowName: payload.workflow?.name,
            failed: status === "failed",
            errorMessage:
              typeof body.errorMessage === "string" ? body.errorMessage : undefined,
            replyToActivityId: payload.teams?.replyToActivityId,
          }).catch((err) => console.error("[workflow-runs/status] teams notify failed", err));
        }
      }
      if (tools?.discordNotify) {
        const botToken = env.discordBotToken();
        if (!botToken) {
          console.error("[workflow-runs/status] discord notify skipped: DISCORD_BOT_TOKEN is not set");
        } else {
          await notifyDiscordWorkflowResult(db, {
            botToken,
            organizationId: org.organizationId,
            owner: run.namespace,
            repo: run.repoName,
            assistantText,
            workflowName: payload.workflow?.name,
            failed: status === "failed",
            errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined,
            replyToMessageId: payload.discord?.replyToMessageId,
          }).catch((err) => console.error("[workflow-runs/status] discord notify failed", err));
        }
      }
    }
  }

  return c.json({ ok: true });
});
