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

export type LinearAgentActivityMilestone =
  | "queued"
  | "preparing"
  | "running"
  | "done"
  | "failed";

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

async function linearAccessTokenForOrg(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  const installation = await getLinearInstallationWithTokens(db, organizationId);
  return installation?.accessToken ?? null;
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
    await createLinearAgentActivity(accessToken, {
      agentSessionId: linearAgentSessionId,
      content: { type: "thought", body },
    });
  } catch (err) {
    console.warn("[linear-agent] failed to emit thought", linearAgentSessionId, err);
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
    await createLinearAgentActivity(accessToken, {
      agentSessionId: linearAgentSessionId,
      content: { type: "error", body },
    });
  } catch (err) {
    console.warn("[linear-agent] failed to emit error activity", linearAgentSessionId, err);
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
  const url = `${apiBase}/api/linear/agent-runs/${runId}`;

  try {
    await updateLinearAgentSession(accessToken, {
      agentSessionId: linearAgentSessionId,
      externalUrls: [{ label: "OpenHarness run", url }],
    });
  } catch (err) {
    console.warn("[linear-agent] failed to set external url", linearAgentSessionId, err);
  }
}

export async function emitLinearAgentRunMilestone(
  db: Database,
  organizationId: string,
  runId: string,
  milestone: LinearAgentActivityMilestone,
  context?: { resultMarkdown?: string; errorMessage?: string },
): Promise<void> {
  const run = await getLinearAgentRunForOrg(db, organizationId, runId);
  if (!run) return;

  const linearAgentSessionId =
    typeof run.payload.linearAgentSessionId === "string"
      ? run.payload.linearAgentSessionId
      : null;
  if (!linearAgentSessionId) return;

  const content = activityForMilestone(milestone, context);
  if (!content) return;

  const accessToken = await linearAccessTokenForOrg(db, organizationId);
  if (!accessToken) return;

  try {
    await createLinearAgentActivity(accessToken, {
      agentSessionId: linearAgentSessionId,
      content,
    });
  } catch (err) {
    console.warn("[linear-agent] failed to emit milestone", runId, milestone, err);
  }
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
