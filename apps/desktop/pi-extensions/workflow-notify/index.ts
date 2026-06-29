// openharness-workflow-notify-version:1
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readWorkflowNotifyConfig } from "./config.js";
import { postDiscordMessage, postTeamsMessage } from "./notify-client.js";

const NotifyParams = Type.Object({
  summary: Type.String({
    description: "Concise user-facing summary to post to the channel (server adds workflow header)",
  }),
});

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
    details: {},
  };
}

export default function openharnessWorkflowNotify(pi: ExtensionAPI) {
  const config = readWorkflowNotifyConfig();
  if (!config) return;

  const notifyGuidelines = [
    "Call the notify tool once you have a final user-facing summary for the channel.",
    "Do not paste raw tool logs or intermediate reasoning — write a concise summary for readers.",
  ];

  if (config.enabledTools.has("post_discord_message")) {
    pi.registerTool({
      name: "post_discord_message",
      label: "Post to Discord",
      description:
        "Post a workflow summary to the Discord channel mapped to this repository in Settings.",
      promptSnippet: "post_discord_message(summary)",
      promptGuidelines: notifyGuidelines,
      parameters: NotifyParams,
      async execute(_toolCallId, params) {
        const summary = String(params.summary ?? "").trim();
        if (!summary) {
          return toolError("summary is required");
        }
        try {
          await postDiscordMessage(config, summary);
          return {
            content: [{ type: "text", text: "Posted summary to Discord." }],
            details: {},
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    });
  }

  if (config.enabledTools.has("post_teams_message")) {
    pi.registerTool({
      name: "post_teams_message",
      label: "Post to Teams",
      description:
        "Post a workflow summary to the Teams channel mapped to this repository in Settings.",
      promptSnippet: "post_teams_message(summary)",
      promptGuidelines: notifyGuidelines,
      parameters: NotifyParams,
      async execute(_toolCallId, params) {
        const summary = String(params.summary ?? "").trim();
        if (!summary) {
          return toolError("summary is required");
        }
        try {
          await postTeamsMessage(config, summary);
          return {
            content: [{ type: "text", text: "Posted summary to Teams." }],
            details: {},
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    });
  }
}
