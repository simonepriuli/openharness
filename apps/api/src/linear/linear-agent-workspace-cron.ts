import type { Database } from "@openharness/db";
import { stopDispatchedSandbox } from "../cloud-worker/stop-sandbox.js";
import {
  expireIssueWorkspacesPastIdleTtl,
  listExpiredIssueWorkspaces,
} from "./linear-agent-issue-workspace-db.js";

export type LinearAgentWorkspaceCronSummary = {
  expired: number;
  sandboxesStopped: number;
  sandboxStopErrors: number;
};

/** How often the API process checks for idle issue workspaces (5 minutes). */
export const LINEAR_AGENT_WORKSPACE_REAPER_TICK_MS = 5 * 60 * 1000;

export async function runLinearAgentWorkspaceCronTick(
  db: Database,
): Promise<LinearAgentWorkspaceCronSummary> {
  const expiredWorkspaces = await listExpiredIssueWorkspaces(db);
  const expired = await expireIssueWorkspacesPastIdleTtl(db);

  let sandboxesStopped = 0;
  let sandboxStopErrors = 0;

  for (const workspace of expiredWorkspaces) {
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

  if (expired > 0) {
    console.info("[linear-agent/workspace] idle TTL cleanup", {
      expired,
      sandboxesStopped,
      sandboxStopErrors,
    });
  }

  return { expired, sandboxesStopped, sandboxStopErrors };
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
