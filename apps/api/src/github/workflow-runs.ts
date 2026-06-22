import { streamSSE } from "hono/streaming";
import { Hono } from "hono";
import { eq } from "@openharness/db";
import { createDb } from "@openharness/db";
import { workflowRun } from "@openharness/db/schema";
import type { AuthSession } from "../auth.js";
import { env } from "../env.js";
import { parseTeamsReport, type TeamsReport } from "../github/workflow-teams-parse.js";
import {
  claimWorkflowRun,
  getWorkflowRunStats,
  listPendingRunsForUser,
  listWorkflowRunsForUser,
  updateWorkflowRunStatus,
} from "./workflow-db.js";
import { notifyTeamsWorkflowResult } from "../teams/teams-notify.js";
import { findChannelMappingForRepo } from "../teams/teams-db.js";
import { teamsInstallation } from "@openharness/db/schema";

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

export const workflowRunRoutes = new Hono<{ Variables: GithubVariables }>();

workflowRunRoutes.get("/", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const workflowId = c.req.query("workflowId") ?? undefined;
  const limit = Number.parseInt(c.req.query("limit") ?? "25", 10) || 25;
  const cursor = c.req.query("cursor") ?? undefined;
  const result = await listWorkflowRunsForUser(db, user.id, { workflowId, limit, cursor });
  return c.json(result);
});

workflowRunRoutes.get("/stats", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const workflowId = c.req.query("workflowId") ?? undefined;
  const stats = await getWorkflowRunStats(db, user.id, workflowId);
  return c.json({ stats });
});

workflowRunRoutes.get("/stream", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return streamSSE(c, async (stream) => {
    let closed = false;
    c.req.raw.signal.addEventListener("abort", () => {
      closed = true;
    });

    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ ok: true }),
    });

    while (!closed) {
      try {
        const runs = await listPendingRunsForUser(db, user.id);
        for (const run of runs) {
          await stream.writeSSE({
            event: "workflow_run",
            data: JSON.stringify({
              id: run.id,
              workflowId: run.workflowId,
              workflowType: run.workflowType,
              projectPath: run.projectPath,
              githubOwner: run.githubOwner,
              githubRepo: run.githubRepo,
              prNumber: run.prNumber,
              event: run.event,
              iteration: run.iteration,
              payload: run.payload,
              createdAt: run.createdAt,
            }),
          });
        }
      } catch (err) {
        console.error("[workflow-runs/stream]", err);
      }

      if (closed) break;

      try {
        await stream.writeSSE({
          event: "ping",
          data: JSON.stringify({ t: Date.now() }),
        });
      } catch {
        closed = true;
        break;
      }

      await stream.sleep(3000);
    }
  });
});

workflowRunRoutes.post("/:id/claim", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const runId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const claimedBy =
    body && typeof body.claimedBy === "string" && body.claimedBy.trim()
      ? body.claimedBy.trim()
      : null;

  if (!claimedBy) {
    return c.json({ error: "claimedBy is required" }, 400);
  }

  const run = await claimWorkflowRun(db, runId, user.id, claimedBy);
  if (!run) {
    return c.json({ error: "Run not available for claim" }, 409);
  }

  return c.json({ run });
});

workflowRunRoutes.post("/:id/status", async (c) => {
  const user = requireUser(c);
  if (!user) {
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

  await updateWorkflowRunStatus(db, runId, user.id, status, {
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
        workflow?: { name?: string; tools?: { teamsNotify?: boolean } };
        teams?: { tenantId?: string; replyToActivityId?: string };
      };
      const tools = payload.workflow?.tools;
      if (tools?.teamsNotify) {
        const mapping = await findChannelMappingForRepo(
          db,
          user.id,
          run.githubOwner,
          run.githubRepo,
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
            userId: user.id,
            owner: run.githubOwner,
            repo: run.githubRepo,
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
    }
  }

  return c.json({ ok: true });
});
