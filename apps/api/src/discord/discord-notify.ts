import type { Database } from "@openharness/db";
import {
  buildWorkflowFailedMessage,
  buildWorkflowNotifyMessages,
  buildWorkflowQueuedMessage,
  DISCORD_MAX_MESSAGE_LENGTH,
} from "../workflow-notify-content.js";
import { findDiscordMappingForRepo, type DiscordChannelRepoMappingRecord } from "./discord-db.js";

const DISCORD_API_BASE = "https://discord.com/api/v10";

type DiscordMessagePayload = {
  content: string;
  message_reference?: {
    message_id: string;
    channel_id: string;
    guild_id: string;
  };
  allowed_mentions?: { replied_user: boolean };
};

export function buildDiscordMessagePayload(
  mapping: DiscordChannelRepoMappingRecord,
  content: string,
  replyToMessageId?: string,
): DiscordMessagePayload {
  return {
    content,
    ...(replyToMessageId
      ? {
          message_reference: {
            message_id: replyToMessageId,
            channel_id: mapping.channelId,
            guild_id: mapping.guildId,
          },
          allowed_mentions: { replied_user: false },
        }
      : {}),
  };
}

function isUnknownMessageReferenceError(text: string): boolean {
  return text.includes("MESSAGE_REFERENCE_UNKNOWN_MESSAGE");
}

export async function postChannelMessage(
  botToken: string,
  mapping: DiscordChannelRepoMappingRecord,
  content: string,
  replyToMessageId?: string,
): Promise<void> {
  const response = await fetch(`${DISCORD_API_BASE}/channels/${mapping.channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildDiscordMessagePayload(mapping, content, replyToMessageId)),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (replyToMessageId && isUnknownMessageReferenceError(text)) {
      await postChannelMessage(botToken, mapping, content);
      return;
    }
    throw new Error(`Discord post failed (${response.status}): ${text || response.statusText}`);
  }
}

export async function sendDiscordQueuedAck(options: {
  botToken: string;
  mapping: DiscordChannelRepoMappingRecord;
  workflowCount: number;
  replyToMessageId?: string;
}): Promise<void> {
  const content = buildWorkflowQueuedMessage(options.workflowCount);
  await postChannelMessage(options.botToken, options.mapping, content, options.replyToMessageId);
}

export async function notifyDiscordWorkflowResult(
  db: Database,
  options: {
    botToken: string;
    organizationId: string;
    owner: string;
    repo: string;
    assistantText: string;
    workflowName?: string;
    failed?: boolean;
    errorMessage?: string;
    replyToMessageId?: string;
  },
): Promise<boolean> {
  const mapping = await findDiscordMappingForRepo(
    db,
    options.organizationId,
    options.owner,
    options.repo,
  );
  if (!mapping) {
    console.warn(
      `[discord-notify] no channel mapping for ${options.owner}/${options.repo} (org ${options.organizationId})`,
    );
    return false;
  }

  const repoFullName = `${options.owner}/${options.repo}`;
  const messages = options.failed
    ? [
        buildWorkflowFailedMessage({
          repoFullName,
          errorMessage: options.errorMessage ?? "Workflow failed.",
        }),
      ]
    : buildWorkflowNotifyMessages({
        workflowName: options.workflowName ?? "OpenHarness workflow complete",
        repoFullName,
        assistantText: options.assistantText,
        maxChunkLength: DISCORD_MAX_MESSAGE_LENGTH,
      });

  for (const [index, content] of messages.entries()) {
    await postChannelMessage(
      options.botToken,
      mapping,
      content,
      index === 0 ? options.replyToMessageId : undefined,
    );
  }

  return true;
}
