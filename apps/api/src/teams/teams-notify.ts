import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  type Activity,
  type ConversationReference,
  type TurnContext,
} from "botbuilder";
import type { Database } from "@openharness/db";
import { env, hasTeamsBot } from "../env.js";
import type { TeamsReport } from "../github/workflow-teams-parse.js";
import {
  buildFailedCard,
  buildQueuedCard,
  buildTeamsReportCard,
} from "./teams-adaptive-cards.js";
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

async function sendAdaptiveCard(
  mapping: TeamsChannelRepoMappingRecord,
  tenantId: string,
  card: Record<string, unknown>,
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
    await context.sendActivity({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: card,
        },
      ],
      ...(replyToId ? { replyToId } : {}),
    });
  });
}

export async function sendTeamsQueuedAck(
  mapping: TeamsChannelRepoMappingRecord,
  tenantId: string,
  workflowCount: number,
  replyToId?: string,
): Promise<void> {
  await sendAdaptiveCard(mapping, tenantId, buildQueuedCard(workflowCount), replyToId);
}

export async function notifyTeamsWorkflowResult(
  db: Database,
  options: {
    userId: string;
    owner: string;
    repo: string;
    tenantId: string;
    report: TeamsReport;
    workflowName?: string;
    failed?: boolean;
    errorMessage?: string;
    replyToActivityId?: string;
  },
): Promise<void> {
  const mapping = await findChannelMappingForRepo(db, options.userId, options.owner, options.repo);
  if (!mapping) return;

  const card = options.failed
    ? buildFailedCard(options.errorMessage ?? "Workflow failed")
    : buildTeamsReportCard(options.report, {
        title: options.workflowName ?? "OpenHarness workflow complete",
        repoFullName: `${options.owner}/${options.repo}`,
      });

  await sendAdaptiveCard(
    mapping,
    options.tenantId,
    card,
    options.replyToActivityId,
  );
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
