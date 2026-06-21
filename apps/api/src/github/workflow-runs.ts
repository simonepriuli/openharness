import { streamSSE } from "hono/streaming";
import { Hono } from "hono";
import { createDb } from "@openharness/db";
import type { AuthSession } from "../auth.js";
import { env } from "../env.js";
import {
  claimWorkflowRun,
  getWorkflowRunStats,
  listPendingRunsForUser,
  listWorkflowRunsForUser,
  updateWorkflowRunStatus,
} from "./workflow-db.js";

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

  return c.json({ ok: true });
});
