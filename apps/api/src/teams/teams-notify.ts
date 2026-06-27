import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  type Activity,
  type ConversationReference,
  type TurnContext,
} from "botbuilder";
import type { Database } from "@openharness/db";
import { env, hasTeamsBot } from "../env.js";
import {
  buildWorkflowFailedMessage,
  buildWorkflowNotifyMessages,
  buildWorkflowQueuedMessage,
  TEAMS_MAX_MESSAGE_LENGTH,
} from "../workflow-notify-content.js";
import {
  findChannelMappingForRepo,
  type TeamsChannelRepoMappingRecord,
  updateChannelConversationRef,
} from "./teams-db.js";

let adapter: CloudAdapter | null = null;

function getAdapter(): CloudAdapter {
  if (!hasTeamsBot()) {
    throw new Error("Teams bot is not configured");
  }
  if (!adapter) {
    const auth = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: env.teamsBotAppId()!,
      MicrosoftAppPassword: env.teamsBotAppSecret()!,
      MicrosoftAppType: "MultiTenant",
    });
    adapter = new CloudAdapter(auth);
  }
  return adapter;
}

function conversationReferenceFromMapping(
  mapping: TeamsChannelRepoMappingRecord,
  tenantId: string,
): ConversationReference | null {
  if (!mapping.conversationId || !mapping.serviceUrl) return null;
  return {
    channelId: mapping.channelId,
    serviceUrl: mapping.serviceUrl,
    conversation: {
      id: mapping.conversationId,
      tenantId,
      isGroup: true,
      conversationType: "channel",
      name: mapping.channelName,
    },
    bot: {
      id: env.teamsBotAppId()!,
      name: "OpenHarness",
    },
  } as ConversationReference;
}

async function sendMarkdownMessages(
  mapping: TeamsChannelRepoMappingRecord,
  tenantId: string,
  messages: string[],
  replyToId?: string,
): Promise<void> {
  const reference = conversationReferenceFromMapping(mapping, tenantId);
  if (!reference) {
    console.warn("[teams-notify] missing conversation reference for channel", mapping.channelId);
    return;
  }

  const botAdapter = getAdapter();
  const appId = env.teamsBotAppId()!;

  await botAdapter.continueConversationAsync(appId, reference, async (context: TurnContext) => {
    for (const [index, text] of messages.entries()) {
      await context.sendActivity({
        type: "message",
        text,
        textFormat: "markdown",
        ...(index === 0 && replyToId ? { replyToId } : {}),
      });
    }
  });
}

export async function sendTeamsQueuedAck(
  mapping: TeamsChannelRepoMappingRecord,
  tenantId: string,
  workflowCount: number,
  replyToId?: string,
): Promise<void> {
  await sendMarkdownMessages(
    mapping,
    tenantId,
    [buildWorkflowQueuedMessage(workflowCount)],
    replyToId,
  );
}

export async function notifyTeamsWorkflowResult(
  db: Database,
  options: {
    organizationId: string;
    owner: string;
    repo: string;
    tenantId: string;
    assistantText: string;
    workflowName?: string;
    failed?: boolean;
    errorMessage?: string;
    replyToActivityId?: string;
  },
): Promise<void> {
  const mapping = await findChannelMappingForRepo(
    db,
    options.organizationId,
    options.owner,
    options.repo,
  );
  if (!mapping) return;

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
        maxChunkLength: TEAMS_MAX_MESSAGE_LENGTH,
      });

  await sendMarkdownMessages(mapping, options.tenantId, messages, options.replyToActivityId);
}

export async function captureConversationReferenceFromActivity(
  db: Database,
  mappingId: string,
  activity: Activity,
): Promise<void> {
  const conversationId = activity.conversation?.id;
  const serviceUrl = activity.serviceUrl;
  if (!conversationId || !serviceUrl) return;
  await updateChannelConversationRef(db, mappingId, conversationId, serviceUrl);
}

export function getTeamsBotAdapter(): CloudAdapter {
  return getAdapter();
}
