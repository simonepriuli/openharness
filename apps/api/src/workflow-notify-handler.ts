import type { Database } from "@openharness/db";
import { eq } from "@openharness/db";
import { workflowRun, teamsInstallation } from "@openharness/db/schema";
import { Result } from "better-result";
import { NotifyError } from "./errors.js";
import { env } from "./env.js";
import { notifyDiscordWorkflowResult } from "./discord/discord-notify.js";
import { findChannelMappingForRepo } from "./teams/teams-db.js";
import { notifyTeamsWorkflowResult } from "./teams/teams-notify.js";

export type WorkflowRunNotifyPayload = {
  workflow?: { name?: string; tools?: { teamsNotify?: boolean; discordNotify?: boolean } };
  teams?: { tenantId?: string; replyToActivityId?: string };
  discord?: { replyToMessageId?: string };
};

const ACTIVE_NOTIFY_STATUSES = new Set(["claimed", "running"]);

function parsePayload(payload: unknown): WorkflowRunNotifyPayload {
  if (!payload || typeof payload !== "object") return {};
  return payload as WorkflowRunNotifyPayload;
}

async function resolveTeamsTenantId(
  db: Database,
  organizationId: string,
  run: { namespace: string; repoName: string },
  payload: WorkflowRunNotifyPayload,
): Promise<string | undefined> {
  if (payload.teams?.tenantId) return payload.teams.tenantId;

  const mapping = await findChannelMappingForRepo(
    db,
    organizationId,
    run.namespace,
    run.repoName,
  );
  if (!mapping) return undefined;

  const rows = await db
    .select({ tenantId: teamsInstallation.tenantId })
    .from(teamsInstallation)
    .where(eq(teamsInstallation.id, mapping.installationId))
    .limit(1);
  return rows[0]?.tenantId;
}

export async function postWorkflowRunDiscordNotify(
  db: Database,
  organizationId: string,
  runId: string,
  summary: string,
): Promise<Result<void, NotifyError>> {
  const trimmed = summary.trim();
  if (!trimmed) {
    return Result.err(new NotifyError({ status: 400, message: "summary is required" }));
  }

  const runs = await db
    .select()
    .from(workflowRun)
    .where(eq(workflowRun.id, runId))
    .limit(1);
  const run = runs[0];
  if (!run || run.organizationId !== organizationId) {
    return Result.err(new NotifyError({ status: 404, message: "Not found" }));
  }
  if (!ACTIVE_NOTIFY_STATUSES.has(run.status)) {
    return Result.err(new NotifyError({ status: 409, message: "Workflow run is not active" }));
  }

  const payload = parsePayload(run.payload);
  if (!payload.workflow?.tools?.discordNotify) {
    return Result.err(
      new NotifyError({ status: 400, message: "Discord notify is not enabled for this workflow" }),
    );
  }

  const botToken = env.discordBotToken();
  if (!botToken) {
    return Result.err(new NotifyError({ status: 503, message: "Discord bot is not configured" }));
  }

  const posted = await notifyDiscordWorkflowResult(db, {
    botToken,
    organizationId,
    owner: run.namespace,
    repo: run.repoName,
    assistantText: trimmed,
    workflowName: payload.workflow?.name,
    failed: false,
    replyToMessageId: payload.discord?.replyToMessageId,
  });
  if (!posted) {
    return Result.err(
      new NotifyError({
        status: 503,
        message: "Discord channel mapping is not configured for this repository",
      }),
    );
  }

  return Result.ok(undefined);
}

export async function postWorkflowRunTeamsNotify(
  db: Database,
  organizationId: string,
  runId: string,
  summary: string,
): Promise<Result<void, NotifyError>> {
  const trimmed = summary.trim();
  if (!trimmed) {
    return Result.err(new NotifyError({ status: 400, message: "summary is required" }));
  }

  const runs = await db
    .select()
    .from(workflowRun)
    .where(eq(workflowRun.id, runId))
    .limit(1);
  const run = runs[0];
  if (!run || run.organizationId !== organizationId) {
    return Result.err(new NotifyError({ status: 404, message: "Not found" }));
  }
  if (!ACTIVE_NOTIFY_STATUSES.has(run.status)) {
    return Result.err(new NotifyError({ status: 409, message: "Workflow run is not active" }));
  }

  const payload = parsePayload(run.payload);
  if (!payload.workflow?.tools?.teamsNotify) {
    return Result.err(
      new NotifyError({ status: 400, message: "Teams notify is not enabled for this workflow" }),
    );
  }

  const tenantId = await resolveTeamsTenantId(db, organizationId, run, payload);
  if (!tenantId) {
    return Result.err(
      new NotifyError({ status: 503, message: "Teams channel mapping is not configured" }),
    );
  }

  await notifyTeamsWorkflowResult(db, {
    organizationId,
    owner: run.namespace,
    repo: run.repoName,
    tenantId,
    assistantText: trimmed,
    workflowName: payload.workflow?.name,
    failed: false,
    replyToActivityId: payload.teams?.replyToActivityId,
  });

  return Result.ok(undefined);
}

export async function notifyWorkflowRunFailure(
  db: Database,
  organizationId: string,
  runId: string,
  errorMessage?: string,
): Promise<void> {
  const runs = await db
    .select()
    .from(workflowRun)
    .where(eq(workflowRun.id, runId))
    .limit(1);
  const run = runs[0];
  if (!run || run.organizationId !== organizationId) return;

  const payload = parsePayload(run.payload);
  const tools = payload.workflow?.tools;

  if (tools?.teamsNotify) {
    const tenantId = await resolveTeamsTenantId(db, organizationId, run, payload);
    if (tenantId) {
      await notifyTeamsWorkflowResult(db, {
        organizationId,
        owner: run.namespace,
        repo: run.repoName,
        tenantId,
        assistantText: "",
        workflowName: payload.workflow?.name,
        failed: true,
        errorMessage: errorMessage ?? "Workflow failed.",
        replyToActivityId: payload.teams?.replyToActivityId,
      }).catch((err) => console.error("[workflow-notify] teams failure notify failed", err));
    }
  }

  if (tools?.discordNotify) {
    const botToken = env.discordBotToken();
    if (!botToken) {
      console.error("[workflow-notify] discord failure notify skipped: DISCORD_BOT_TOKEN is not set");
    } else {
      await notifyDiscordWorkflowResult(db, {
        botToken,
        organizationId,
        owner: run.namespace,
        repo: run.repoName,
        assistantText: "",
        workflowName: payload.workflow?.name,
        failed: true,
        errorMessage: errorMessage ?? "Workflow failed.",
        replyToMessageId: payload.discord?.replyToMessageId,
      }).catch((err) => console.error("[workflow-notify] discord failure notify failed", err));
    }
  }
}
