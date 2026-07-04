import type { Database } from "@openharness/db";
import { env } from "../env.js";
import { isCloudInfraConfigured } from "../cloud-worker/resolve-executor.js";
import {
  createLinearAgentActivity,
  updateLinearAgentSession,
  type LinearAgentActivityContent,
} from "./linear-client.js";
import { getLinearAgentRunForOrg } from "./linear-agent-db.js";
import { getLinearInstallationWithTokens } from "./linear-db.js";

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

async function linearAccessTokenForOrg(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  const installation = await getLinearInstallationWithTokens(db, organizationId);
  return installation?.accessToken ?? null;
}

function linearAgentSessionIdFromRun(
  run: NonNullable<Awaited<ReturnType<typeof getLinearAgentRunForOrg>>>,
): string | null {
  return typeof run.payload.linearAgentSessionId === "string"
    ? run.payload.linearAgentSessionId
    : null;
}

async function createActivityWithOptionalRetry(
  accessToken: string,
  input: {
    agentSessionId: string;
    content: LinearAgentActivityContent;
    ephemeral?: boolean;
  },
): Promise<void> {
  try {
    await createLinearAgentActivity(accessToken, input);
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err;
    await createLinearAgentActivity(accessToken, input);
  }
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
    await updateLinearAgentSession(accessToken, {
      agentSessionId: linearAgentSessionId,
      externalUrls: [{ label: "OpenHarness run", url }],
    });
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
  await emitLinearAgentActivity(db, organizationId, runId, content);
}

export function isLinearAgentCloudReady(): boolean {
  return isCloudInfraConfigured();
}

export async function assertLinearAgentCloudReady(
  db: Database,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isCloudInfraConfigured()) {
    return {
      ok: false,
      message:
        "Cloud workers are required for the OpenHarness Linear agent but are not configured on this server.",
    };
  }

  const { orgCloudWorkersAvailable } = await import("./linear-agent-db.js");
  const enabled = await orgCloudWorkersAvailable(db, organizationId);
  if (!enabled) {
    return {
      ok: false,
      message:
        "Cloud workers are required for the OpenHarness Linear agent. Ask an admin to enable cloud workers for your organization.",
    };
  }

  return { ok: true };
}

export { linearAgentSessionIdFromRun };
