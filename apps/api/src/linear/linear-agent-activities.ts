import type { Database } from "@openharness/db";
import { Result } from "better-result";
import { LinearApiError, ValidationError } from "../errors.js";
import { env } from "../env.js";
import { isCloudInfraConfigured } from "../cloud-worker/resolve-executor.js";
import { issueSandboxName, runSandboxName } from "../cloud-worker/sandbox-names.js";
import { stopDispatchedSandbox } from "../cloud-worker/stop-sandbox.js";
import {
  createLinearAgentActivity,
  updateLinearAgentSession,
  type LinearAgentActivityContent,
} from "./linear-client.js";
import {
  getLinearAgentIssueWorkspace,
  releaseIssueWorkspaceAfterRun,
} from "./linear-agent-issue-workspace-db.js";
import {
  getLinearAgentRunForOrg,
  getLinearAgentSessionByLinearId,
  listActiveLinearAgentRunsForLinearSession,
  type LinearAgentRunRecord,
  updateLinearAgentRunStatus,
  updateLinearAgentSessionStatus,
} from "./linear-agent-db.js";
import { getValidLinearAccessToken } from "./linear-token.js";

export type { LinearAgentActivityContent };

export type LinearAgentActivityMilestone =
  | "queued"
  | "preparing"
  | "running"
  | "done"
  | "failed";

export type EmitLinearAgentActivityOptions = {
  ephemeral?: boolean;
};

function activityForMilestone(
  milestone: LinearAgentActivityMilestone,
  context?: { resultMarkdown?: string; errorMessage?: string },
): LinearAgentActivityContent | null {
  switch (milestone) {
    case "queued":
      return { type: "action", action: "Queued", parameter: "OpenHarness agent run" };
    case "preparing":
      return { type: "action", action: "Preparing", parameter: "repository" };
    case "running":
      return { type: "action", action: "Running", parameter: "agent" };
    case "done":
      return {
        type: "response",
        body: context?.resultMarkdown?.trim() || "OpenHarness agent finished.",
      };
    case "failed":
      return {
        type: "error",
        body: context?.errorMessage?.trim() || "OpenHarness agent run failed.",
      };
    default:
      return null;
  }
}

function isTransientNetworkError(err: unknown): boolean {
  if (LinearApiError.is(err)) {
    const message = err.message.toLowerCase();
    return (
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("socket hang up")
    );
  }
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up")
  );
}

async function createActivityWithOptionalRetry(
  accessToken: string,
  input: {
    agentSessionId: string;
    content: LinearAgentActivityContent;
    ephemeral?: boolean;
  },
): Promise<void> {
  const first = await createLinearAgentActivity(accessToken, input);
  if (Result.isOk(first)) return;

  if (!isTransientNetworkError(first.error)) throw first.error;

  const second = await createLinearAgentActivity(accessToken, input);
  if (Result.isError(second)) throw second.error;
}

async function linearAccessTokenForOrg(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  return getValidLinearAccessToken(db, organizationId);
}

function linearAgentSessionIdFromRun(
  run: NonNullable<Awaited<ReturnType<typeof getLinearAgentRunForOrg>>>,
): string | null {
  return typeof run.payload.linearAgentSessionId === "string"
    ? run.payload.linearAgentSessionId
    : null;
}

export async function emitLinearAgentActivity(
  db: Database,
  organizationId: string,
  runId: string,
  content: LinearAgentActivityContent,
  options?: EmitLinearAgentActivityOptions,
): Promise<void> {
  const run = await getLinearAgentRunForOrg(db, organizationId, runId);
  if (!run) {
    console.warn("[linear-agent] emit activity skipped: run not found", {
      runId,
      organizationId,
      contentType: content.type,
    });
    return;
  }

  if (run.status !== "claimed" && run.status !== "running") {
    console.warn("[linear-agent] emit activity skipped: run not active", {
      runId,
      organizationId,
      status: run.status,
      contentType: content.type,
    });
    return;
  }

  const linearAgentSessionId = linearAgentSessionIdFromRun(run);
  if (!linearAgentSessionId) {
    console.warn("[linear-agent] emit activity skipped: missing session id", {
      runId,
      organizationId,
      contentType: content.type,
    });
    return;
  }

  const accessToken = await linearAccessTokenForOrg(db, organizationId);
  if (!accessToken) {
    console.warn("[linear-agent] emit activity skipped: no access token", {
      runId,
      organizationId,
      contentType: content.type,
    });
    return;
  }

  try {
    await createActivityWithOptionalRetry(accessToken, {
      agentSessionId: linearAgentSessionId,
      content,
      ephemeral: options?.ephemeral,
    });
  } catch (err) {
    console.warn("[linear-agent] failed to emit activity", {
      runId,
      linearAgentSessionId,
      contentType: content.type,
      ephemeral: options?.ephemeral ?? false,
      err,
    });
  }
}

export async function emitLinearAgentSessionThought(
  db: Database,
  organizationId: string,
  linearAgentSessionId: string,
  body: string,
): Promise<void> {
  const accessToken = await linearAccessTokenForOrg(db, organizationId);
  if (!accessToken) return;

  try {
    await createActivityWithOptionalRetry(accessToken, {
      agentSessionId: linearAgentSessionId,
      content: { type: "thought", body },
    });
  } catch (err) {
    console.warn("[linear-agent] failed to emit thought", {
      linearAgentSessionId,
      err,
    });
  }
}

export async function emitLinearAgentSessionError(
  db: Database,
  organizationId: string,
  linearAgentSessionId: string,
  body: string,
): Promise<void> {
  const accessToken = await linearAccessTokenForOrg(db, organizationId);
  if (!accessToken) return;

  try {
    await createActivityWithOptionalRetry(accessToken, {
      agentSessionId: linearAgentSessionId,
      content: { type: "error", body },
    });
  } catch (err) {
    console.warn("[linear-agent] failed to emit error activity", {
      linearAgentSessionId,
      err,
    });
  }
}

export async function setLinearAgentSessionExternalUrl(
  db: Database,
  organizationId: string,
  linearAgentSessionId: string,
  runId: string,
): Promise<void> {
  const accessToken = await linearAccessTokenForOrg(db, organizationId);
  if (!accessToken) return;

  const apiBase = env.betterAuthUrl().replace(/\/$/, "");
  const url = `${apiBase}/api/linear/agent-runs/${runId}/view`;

  try {
    const updateResult = await updateLinearAgentSession(accessToken, {
      agentSessionId: linearAgentSessionId,
      externalUrls: [{ label: "OpenHarness run", url }],
    });
    if (Result.isError(updateResult)) throw updateResult.error;
  } catch (err) {
    console.warn("[linear-agent] failed to set external url", {
      linearAgentSessionId,
      runId,
      err,
    });
  }
}

export async function emitLinearAgentRunMilestone(
  db: Database,
  organizationId: string,
  runId: string,
  milestone: LinearAgentActivityMilestone,
  context?: { resultMarkdown?: string; errorMessage?: string },
): Promise<void> {
  const content = activityForMilestone(milestone, context);
  if (!content) return;

  const run = await getLinearAgentRunForOrg(db, organizationId, runId);
  if (!run) {
    console.warn("[linear-agent] emit milestone skipped: run not found", { runId, organizationId });
    return;
  }

  const linearAgentSessionId = linearAgentSessionIdFromRun(run);
  if (!linearAgentSessionId) {
    console.warn("[linear-agent] emit milestone skipped: missing session id", {
      runId,
      organizationId,
      milestone,
    });
    return;
  }

  const accessToken = await linearAccessTokenForOrg(db, organizationId);
  if (!accessToken) {
    console.warn("[linear-agent] emit milestone skipped: no access token", {
      runId,
      organizationId,
      milestone,
    });
    return;
  }

  try {
    await createActivityWithOptionalRetry(accessToken, {
      agentSessionId: linearAgentSessionId,
      content,
      ephemeral: milestone === "preparing" || milestone === "running" ? undefined : false,
    });
  } catch (err) {
    console.warn("[linear-agent] failed to emit milestone", {
      runId,
      linearAgentSessionId,
      milestone,
      err,
    });
  }
}

const LINEAR_AGENT_USER_STOP_MESSAGE = "Run stopped by user request from Linear.";

export async function emitLinearAgentSessionResponse(
  db: Database,
  organizationId: string,
  linearAgentSessionId: string,
  body: string,
): Promise<void> {
  const accessToken = await linearAccessTokenForOrg(db, organizationId);
  if (!accessToken) return;

  try {
    await createActivityWithOptionalRetry(accessToken, {
      agentSessionId: linearAgentSessionId,
      content: { type: "response", body },
    });
  } catch (err) {
    console.warn("[linear-agent] failed to emit session response", {
      linearAgentSessionId,
      err,
    });
  }
}

async function resolveSandboxNameForLinearAgentRun(
  db: Database,
  run: LinearAgentRunRecord,
): Promise<string | null> {
  if (run.runnerKind === "issue_workspace" && run.linearIssueId?.trim()) {
    const workspace = await getLinearAgentIssueWorkspace(
      db,
      run.organizationId,
      run.linearIssueId.trim(),
    );
    return (
      workspace?.sandboxName ?? issueSandboxName(run.organizationId, run.linearIssueId.trim())
    );
  }

  if (run.status === "claimed" || run.status === "running") {
    return runSandboxName(`agent-${run.id}`);
  }

  return null;
}

async function releaseIssueWorkspaceForStoppedRun(
  db: Database,
  run: LinearAgentRunRecord,
): Promise<void> {
  if (run.runnerKind !== "issue_workspace" || !run.linearIssueId?.trim()) return;

  const issueWorkspace = await getLinearAgentIssueWorkspace(
    db,
    run.organizationId,
    run.linearIssueId.trim(),
  );
  if (issueWorkspace?.status !== "busy") return;

  await releaseIssueWorkspaceAfterRun(db, {
    organizationId: run.organizationId,
    linearIssueId: run.linearIssueId.trim(),
    runId: run.id,
    success: false,
  });
}

export async function handleLinearAgentStopRequest(
  db: Database,
  organizationId: string,
  linearAgentSessionId: string,
): Promise<void> {
  const activeRuns = await listActiveLinearAgentRunsForLinearSession(
    db,
    organizationId,
    linearAgentSessionId,
  );

  const sandboxesToStop = new Set<string>();
  let stoppedAnyRun = false;

  for (const run of activeRuns) {
    const updated = await getLinearAgentRunForOrg(db, organizationId, run.id);
    if (!updated || (updated.status !== "pending" && updated.status !== "claimed" && updated.status !== "running")) {
      continue;
    }

    await updateLinearAgentRunStatus(db, run.id, organizationId, "failed", {
      errorMessage: LINEAR_AGENT_USER_STOP_MESSAGE,
    });
    await releaseIssueWorkspaceForStoppedRun(db, run);
    stoppedAnyRun = true;

    const sandboxName = await resolveSandboxNameForLinearAgentRun(db, run);
    if (sandboxName) {
      sandboxesToStop.add(sandboxName);
    }
  }

  for (const sandboxName of sandboxesToStop) {
    try {
      await stopDispatchedSandbox(sandboxName);
    } catch (err) {
      console.warn("[linear-agent] failed to stop sandbox after user stop", {
        linearAgentSessionId,
        sandboxName,
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  const session = await getLinearAgentSessionByLinearId(db, linearAgentSessionId);
  if (session) {
    await updateLinearAgentSessionStatus(db, session.id, organizationId, "complete");
  }

  if (stoppedAnyRun) {
    await emitLinearAgentSessionResponse(
      db,
      organizationId,
      linearAgentSessionId,
      "OpenHarness stopped working on this request.",
    );
    console.info("[linear-agent] handled user stop request", {
      linearAgentSessionId,
      organizationId,
      stoppedRuns: activeRuns.map((run) => run.id),
      sandboxesStopped: [...sandboxesToStop],
    });
  }
}

export async function interruptLinearAgentRun(
  db: Database,
  organizationId: string,
  runId: string,
  errorMessage: string,
): Promise<boolean> {
  const run = await getLinearAgentRunForOrg(db, organizationId, runId);
  if (!run || (run.status !== "claimed" && run.status !== "running")) {
    return false;
  }

  await emitLinearAgentRunMilestone(db, organizationId, runId, "failed", { errorMessage });
  await updateLinearAgentRunStatus(db, runId, organizationId, "failed", { errorMessage });
  if (run.sessionId) {
    await updateLinearAgentSessionStatus(db, run.sessionId, organizationId, "error");
  }

  await releaseIssueWorkspaceForStoppedRun(db, run);

  const sandboxName = await resolveSandboxNameForLinearAgentRun(db, run);
  if (sandboxName) {
    try {
      await stopDispatchedSandbox(sandboxName);
    } catch (err) {
      console.warn("[linear-agent] failed to stop sandbox after interrupt", {
        runId,
        organizationId,
        sandboxName,
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  return true;
}

export function isLinearAgentCloudReady(): boolean {
  return isCloudInfraConfigured();
}

export async function assertLinearAgentCloudReady(
  db: Database,
  organizationId: string,
): Promise<Result<void, ValidationError>> {
  if (!isCloudInfraConfigured()) {
    return Result.err(
      new ValidationError({
        message:
          "Cloud workers are required for the OpenHarness Linear agent but are not configured on this server.",
      }),
    );
  }

  const { orgCloudWorkersAvailable } = await import("./linear-agent-db.js");
  const enabled = await orgCloudWorkersAvailable(db, organizationId);
  if (!enabled) {
    return Result.err(
      new ValidationError({
        message:
          "Cloud workers are required for the OpenHarness Linear agent. Ask an admin to enable cloud workers for your organization.",
      }),
    );
  }

  return Result.ok(undefined);
}

export { linearAgentSessionIdFromRun };
