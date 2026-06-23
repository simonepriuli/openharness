import { and, eq, sql, type Database } from "@openharness/db";
import { projectSourceControlConnection, type SourceControlProvider } from "@openharness/db/schema";
import {
  insertWorkflowRun,
  listEnabledWorkflowsForConnection,
} from "../github/workflow-db.js";
import type { WorkflowDiscordMentionTrigger } from "../github/workflow-types.js";
import {
  findDiscordMappingByChannelId,
  listDiscordInstallationsForOrg,
} from "./discord-db.js";
import { sendDiscordQueuedAck } from "./discord-notify.js";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const mentionRateByChannel = new Map<string, { count: number; windowStart: number }>();

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

function workflowHasDiscordMentionTrigger(triggers: unknown): boolean {
  if (!Array.isArray(triggers)) return false;
  return triggers.some(
    (trigger) =>
      trigger &&
      typeof trigger === "object" &&
      (trigger as WorkflowDiscordMentionTrigger).kind === "discord_mention",
  );
}

export async function handleDiscordMentionActivity(
  db: Database,
  options: {
    botToken: string;
    channelId: string;
    messageText: string;
    messageId: string;
    replyToMessageId?: string | null;
    userId: string | null;
  },
): Promise<void> {
  const channelId = options.channelId;
  if (!channelId || typeof channelId !== "string") return;
  if (!options.messageText.trim()) return;

  if (isRateLimited(channelId)) {
    console.warn("[discord-webhook] rate limited channel", channelId);
    return;
  }

  const mapping = await findDiscordMappingByChannelId(db, channelId);
  if (!mapping) {
    console.warn("[discord-webhook] no channel mapping for", channelId);
    return;
  }

  const installations = await listDiscordInstallationsForOrg(db, mapping.organizationId);
  const installation = installations.find((row) => row.id === mapping.installationId);
  if (!installation) return;

  const connectionRows = await db
    .select()
    .from(projectSourceControlConnection)
    .where(
      and(
        eq(projectSourceControlConnection.organizationId, mapping.organizationId),
        eq(projectSourceControlConnection.provider, mapping.provider as SourceControlProvider),
        sql`lower(${projectSourceControlConnection.namespace}) = ${mapping.namespace.toLowerCase()}`,
        sql`lower(${projectSourceControlConnection.name}) = ${mapping.repoName.toLowerCase()}`,
      ),
    );

  let enqueued = 0;
  const activityId = options.messageId || `${Date.now()}`;

  for (const connection of connectionRows) {
    const workflows = await listEnabledWorkflowsForConnection(db, connection.id);
    const matching = workflows.filter((workflow) =>
      workflowHasDiscordMentionTrigger(workflow.triggers),
    );

    for (const workflowRecord of matching) {
      const deliveryId = `discord:${channelId}:${activityId}:${workflowRecord.id}`;
      const result = await insertWorkflowRun(db, {
        organizationId: mapping.organizationId,
        userId: mapping.userId,
        projectSourceControlConnectionId: connection.id,
        connectionId: connection.connectionId,
        provider: connection.provider,
        namespace: connection.namespace,
        repoName: connection.name,
        prNumber: 0,
        workflowId: workflowRecord.id,
        workflowType: null,
        event: "discord_mention",
        deliveryId,
        iteration: 1,
        payload: {
          branch: workflowRecord.targetBranch,
          discord: {
            channelId,
            discordMessageText: options.messageText,
            discordUserId: options.userId,
            replyToMessageId: options.replyToMessageId ?? undefined,
            guildId: installation.guildId,
          },
          workflow: {
            id: workflowRecord.id,
            name: workflowRecord.name,
            model: workflowRecord.model,
            instructions: workflowRecord.instructions,
            targetBranch: workflowRecord.targetBranch,
            tools: workflowRecord.tools,
            triggerEvent: "discord_mention",
          },
        },
      });
      if (result.inserted) enqueued += 1;
    }
  }

  if (enqueued > 0) {
    await sendDiscordQueuedAck({
      botToken: options.botToken,
      mapping,
      workflowCount: enqueued,
      replyToMessageId: options.replyToMessageId ?? undefined,
    }).catch((err) => console.error("[discord-webhook] failed to send ack", err));
  }
}
