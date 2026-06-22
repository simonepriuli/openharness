import type { Activity } from "botbuilder";
import { and, eq, sql, type Database } from "@openharness/db";
import { projectGithubConnection } from "@openharness/db/schema";
import {
  insertWorkflowRun,
  listEnabledWorkflowsForConnection,
} from "../github/workflow-db.js";
import type { WorkflowTeamsMentionTrigger } from "../github/workflow-types.js";
import {
  captureConversationReferenceFromActivity,
  sendTeamsQueuedAck,
} from "./teams-notify.js";
import { findChannelMappingByChannelId, listTeamsInstallationsForUser } from "./teams-db.js";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const mentionRateByChannel = new Map<string, { count: number; windowStart: number }>();

function stripBotMention(text: string, activity: Activity): string {
  const mentionEntities = (activity.entities ?? []).filter(
    (entity) => entity.type === "mention",
  );
  let cleaned = text;
  for (const entity of mentionEntities) {
    const mentionText = (entity as { text?: string }).text;
    if (mentionText) {
      cleaned = cleaned.replace(mentionText, "");
    }
  }
  return cleaned.trim();
}

function isBotMentioned(activity: Activity, botAppId?: string): boolean {
  if (!botAppId) return false;
  const mentions = (activity.entities ?? []).filter((entity) => entity.type === "mention");
  return mentions.some((entity) => {
    const mentioned = (entity as { mentioned?: { id?: string } }).mentioned;
    return mentioned?.id === botAppId || mentioned?.id?.includes(botAppId);
  });
}

function isRateLimited(channelId: string): boolean {
  const now = Date.now();
  const entry = mentionRateByChannel.get(channelId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    mentionRateByChannel.set(channelId, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function workflowHasTeamsMentionTrigger(triggers: unknown): boolean {
  if (!Array.isArray(triggers)) return false;
  return triggers.some(
    (trigger) =>
      trigger &&
      typeof trigger === "object" &&
      (trigger as WorkflowTeamsMentionTrigger).kind === "teams_mention",
  );
}

export async function handleTeamsMentionActivity(
  db: Database,
  activity: Activity,
  botAppId: string,
): Promise<void> {
  if (activity.type !== "message") return;
  if (!isBotMentioned(activity, botAppId)) return;

  const channelData = activity.channelData as { channel?: { id?: string } } | undefined;
  const channelId = channelData?.channel?.id ?? activity.conversation?.id;
  if (!channelId || typeof channelId !== "string") return;

  if (isRateLimited(channelId)) {
    console.warn("[teams-webhook] rate limited channel", channelId);
    return;
  }

  const mapping = await findChannelMappingByChannelId(db, channelId);
  if (!mapping) {
    console.warn("[teams-webhook] no channel mapping for", channelId);
    return;
  }

  await captureConversationReferenceFromActivity(db, mapping.id, activity);

  const installations = await listTeamsInstallationsForUser(db, mapping.userId);
  const installation = installations.find((row) => row.id === mapping.installationId);
  if (!installation) return;

  const messageText = stripBotMention(activity.text ?? "", activity);
  if (!messageText) return;

  const connectionRows = await db
    .select()
    .from(projectGithubConnection)
    .where(
      and(
        eq(projectGithubConnection.userId, mapping.userId),
        sql`lower(${projectGithubConnection.githubOwner}) = ${mapping.githubOwner.toLowerCase()}`,
        sql`lower(${projectGithubConnection.githubRepo}) = ${mapping.githubRepo.toLowerCase()}`,
      ),
    );

  let enqueued = 0;
  const activityId = activity.id ?? `${Date.now()}`;

  for (const connection of connectionRows) {
    const workflows = await listEnabledWorkflowsForConnection(db, connection.id);
    const matching = workflows.filter((workflow) =>
      workflowHasTeamsMentionTrigger(workflow.triggers),
    );

    for (const workflowRecord of matching) {
      const deliveryId = `teams:${channelId}:${activityId}:${workflowRecord.id}`;
      const result = await insertWorkflowRun(db, {
        userId: mapping.userId,
        projectGithubConnectionId: connection.id,
        projectPath: connection.projectPath,
        installationId: connection.installationId,
        githubOwner: connection.githubOwner,
        githubRepo: connection.githubRepo,
        prNumber: 0,
        workflowId: workflowRecord.id,
        workflowType: null,
        event: "teams_mention",
        deliveryId,
        iteration: 1,
        payload: {
          branch: workflowRecord.targetBranch,
          teams: {
            channelId,
            teamsMessageText: messageText,
            teamsUserId: activity.from?.id ?? null,
            replyToActivityId: activityId,
            tenantId: installation.tenantId,
          },
          workflow: {
            id: workflowRecord.id,
            name: workflowRecord.name,
            model: workflowRecord.model,
            instructions: workflowRecord.instructions,
            targetBranch: workflowRecord.targetBranch,
            tools: workflowRecord.tools,
            triggerEvent: "teams_mention",
          },
        },
      });
      if (result.inserted) enqueued += 1;
    }
  }

  if (enqueued > 0) {
    await sendTeamsQueuedAck(
      mapping,
      installation.tenantId,
      enqueued,
      activityId,
    ).catch((err) => console.error("[teams-webhook] failed to send ack", err));
  }
}
