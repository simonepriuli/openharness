import { Hono } from "hono";
import { eq } from "@openharness/db";
import { createDb } from "@openharness/db";
import { workflowRun } from "@openharness/db/schema";
import { env } from "../env.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import { parseTeamsReport, type TeamsReport } from "../github/workflow-teams-parse.js";
import {
  claimWorkflowRun,
  getWorkflowRunStats,
  listPendingRunsForOrg,
  listWorkflowRunsForOrg,
  updateWorkflowRunStatus,
} from "../github/workflow-db.js";
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
  });

  if (status === "done" || status === "failed") {
    const teamsResult =
      body.teamsResult && typeof body.teamsResult === "object"
        ? (body.teamsResult as TeamsReport)
        : typeof body.teamsAssistantText === "string"
          ? parseTeamsReport(
              body.teamsAssistantText,
              body.teamsReportKind === "bug_triage" ? "bug_triage" : "cve_scan",
            )
          : null;

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
            report:
              teamsResult ??
              parseTeamsReport(
                typeof body.teamsAssistantText === "string" ? body.teamsAssistantText : "",
                run.event === "teams_mention" ? "bug_triage" : "cve_scan",
              ),
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
        if (botToken) {
          await notifyDiscordWorkflowResult(db, {
            botToken,
            organizationId: org.organizationId,
            owner: run.namespace,
            repo: run.repoName,
            report:
              teamsResult ??
              parseTeamsReport(
                typeof body.teamsAssistantText === "string" ? body.teamsAssistantText : "",
                run.event === "discord_mention" ? "bug_triage" : "cve_scan",
              ),
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
