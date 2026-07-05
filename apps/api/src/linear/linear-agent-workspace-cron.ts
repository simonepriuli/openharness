import type { Database } from "@openharness/db";
import { stopDispatchedSandbox } from "../cloud-worker/stop-sandbox.js";
import { interruptLinearAgentRun } from "./linear-agent-activities.js";
import {
  listActiveLinearAgentRunsForIssue,
  listStaleLinearAgentRuns,
} from "./linear-agent-db.js";
import {
  expireIssueWorkspacesPastIdleTtl,
  listExpiredIssueWorkspaces,
  listInvalidatedIssueWorkspaces,
  listStuckBusyIssueWorkspaces,
  deleteIssueWorkspaceById,
  releaseOrphanedBusyIssueWorkspace,
} from "./linear-agent-issue-workspace-db.js";

export type LinearAgentWorkspaceCronSummary = {
  expired: number;
  sandboxesStopped: number;
  sandboxStopErrors: number;
  staleRunsInterrupted: number;
  workspaceRunsInterrupted: number;
  stuckBusyReleased: number;
  invalidatedCleaned: number;
};

const SANDBOX_STOPPED_ERROR =
  "Run interrupted — the issue sandbox was stopped before the agent finished.";
const STALE_RUN_ERROR =
  "Run interrupted — the agent stopped responding before completion.";

/** How often the API process checks for idle issue workspaces (5 minutes). */
export const LINEAR_AGENT_WORKSPACE_REAPER_TICK_MS = 5 * 60 * 1000;

export async function runLinearAgentWorkspaceCronTick(
  db: Database,
): Promise<LinearAgentWorkspaceCronSummary> {
  const expiredWorkspaces = await listExpiredIssueWorkspaces(db);
  const expired = await expireIssueWorkspacesPastIdleTtl(db);

  let sandboxesStopped = 0;
  let sandboxStopErrors = 0;
  let workspaceRunsInterrupted = 0;

  for (const workspace of expiredWorkspaces) {
    const activeRuns = await listActiveLinearAgentRunsForIssue(
      db,
      workspace.organizationId,
      workspace.linearIssueId,
    );
    for (const run of activeRuns) {
      if (
        await interruptLinearAgentRun(db, workspace.organizationId, run.id, SANDBOX_STOPPED_ERROR)
      ) {
        workspaceRunsInterrupted += 1;
      }
    }

    try {
      await stopDispatchedSandbox(workspace.sandboxName);
      sandboxesStopped += 1;
    } catch (err) {
      sandboxStopErrors += 1;
      console.warn("[linear-agent/workspace] failed to stop expired sandbox", {
        linearIssueId: workspace.linearIssueId,
        sandboxName: workspace.sandboxName,
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  let staleRunsInterrupted = 0;
  const staleRuns = await listStaleLinearAgentRuns(db);
  for (const run of staleRuns) {
    if (await interruptLinearAgentRun(db, run.organizationId, run.id, STALE_RUN_ERROR)) {
      staleRunsInterrupted += 1;
    }
  }

  let stuckBusyReleased = 0;
  const stuckBusyWorkspaces = await listStuckBusyIssueWorkspaces(db);
  for (const workspace of stuckBusyWorkspaces) {
    const activeRuns = await listActiveLinearAgentRunsForIssue(
      db,
      workspace.organizationId,
      workspace.linearIssueId,
    );
    for (const run of activeRuns) {
      await interruptLinearAgentRun(db, workspace.organizationId, run.id, STALE_RUN_ERROR);
    }

    if (await releaseOrphanedBusyIssueWorkspace(db, workspace)) {
      stuckBusyReleased += 1;
      try {
        await stopDispatchedSandbox(workspace.sandboxName);
        sandboxesStopped += 1;
      } catch (err) {
        sandboxStopErrors += 1;
        console.warn("[linear-agent/workspace] failed to stop stuck busy sandbox", {
          linearIssueId: workspace.linearIssueId,
          sandboxName: workspace.sandboxName,
          err: err instanceof Error ? err.message : err,
        });
      }
    }
  }

  let invalidatedCleaned = 0;
  const invalidatedWorkspaces = await listInvalidatedIssueWorkspaces(db);
  for (const workspace of invalidatedWorkspaces) {
    try {
      await stopDispatchedSandbox(workspace.sandboxName);
      sandboxesStopped += 1;
    } catch (err) {
      sandboxStopErrors += 1;
      console.warn("[linear-agent/workspace] failed to stop invalidated sandbox", {
        linearIssueId: workspace.linearIssueId,
        sandboxName: workspace.sandboxName,
        err: err instanceof Error ? err.message : err,
      });
    }
    invalidatedCleaned += 1;
    await deleteIssueWorkspaceById(db, workspace.id);
  }

  if (
    expired > 0 ||
    staleRunsInterrupted > 0 ||
    workspaceRunsInterrupted > 0 ||
    stuckBusyReleased > 0 ||
    invalidatedCleaned > 0
  ) {
    console.info("[linear-agent/workspace] idle TTL cleanup", {
      expired,
      sandboxesStopped,
      sandboxStopErrors,
      staleRunsInterrupted,
      workspaceRunsInterrupted,
      stuckBusyReleased,
      invalidatedCleaned,
    });
  }

  return {
    expired,
    sandboxesStopped,
    sandboxStopErrors,
    staleRunsInterrupted,
    workspaceRunsInterrupted,
    stuckBusyReleased,
    invalidatedCleaned,
  };
}

export function startLinearAgentWorkspaceReaper(db: Database): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runLinearAgentWorkspaceCronTick(db);
    } catch (err) {
      console.error("[linear-agent/workspace-reaper]", err);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), LINEAR_AGENT_WORKSPACE_REAPER_TICK_MS);
  return () => clearInterval(timer);
}
