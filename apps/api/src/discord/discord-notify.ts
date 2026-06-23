import type { Database } from "@openharness/db";
import type { TeamsReport } from "../github/workflow-teams-parse.js";
import { findDiscordMappingForRepo, type DiscordChannelRepoMappingRecord } from "./discord-db.js";

const DISCORD_API_BASE = "https://discord.com/api/v10";

function renderDiscordReport(
  report: TeamsReport,
  options: { title: string; repoFullName: string },
): string {
  if (report.kind === "cve_scan") {
    const lines = report.vulnerabilities
      .slice(0, 10)
      .map((vuln) => {
        const sev = vuln.severity ? ` (${vuln.severity})` : "";
        const advisory = vuln.advisory ? ` - ${vuln.advisory}` : "";
        const action = vuln.action ? ` -> ${vuln.action}` : "";
        return `- \`${vuln.dependency}\`${sev}${advisory}${action}`;
      });
    return [
      `**${options.title}**`,
      `Repository: \`${options.repoFullName}\``,
      "",
      report.summary,
      "",
      lines.length > 0 ? "**Vulnerabilities**" : "No known vulnerable dependencies detected.",
      ...lines,
    ].join("\n");
  }

  return [
    `**${options.title}**`,
    `Repository: \`${options.repoFullName}\``,
    "",
    report.summary,
    "",
    ...(report.findings.length > 0 ? ["**Findings**", ...report.findings.map((f) => `- ${f}`)] : []),
    ...(report.suggestedNextSteps.length > 0
      ? ["", "**Suggested next steps**", ...report.suggestedNextSteps.map((s) => `- ${s}`)]
      : []),
  ].join("\n");
}

async function postChannelMessage(
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
    body: JSON.stringify({
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
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord post failed (${response.status}): ${text || response.statusText}`);
  }
}

export async function sendDiscordQueuedAck(options: {
  botToken: string;
  mapping: DiscordChannelRepoMappingRecord;
  workflowCount: number;
  replyToMessageId?: string;
}): Promise<void> {
  const content = `Queued ${options.workflowCount} workflow${options.workflowCount === 1 ? "" : "s"} for this request.`;
  await postChannelMessage(options.botToken, options.mapping, content, options.replyToMessageId);
}

export async function notifyDiscordWorkflowResult(
  db: Database,
  options: {
    botToken: string;
    organizationId: string;
    owner: string;
    repo: string;
    report: TeamsReport;
    workflowName?: string;
    failed?: boolean;
    errorMessage?: string;
    replyToMessageId?: string;
  },
): Promise<void> {
  const mapping = await findDiscordMappingForRepo(
    db,
    options.organizationId,
    options.owner,
    options.repo,
  );
  if (!mapping) return;

  const content = options.failed
    ? `**Workflow failed**\nRepository: \`${options.owner}/${options.repo}\`\n\n${options.errorMessage ?? "Workflow failed."}`
    : renderDiscordReport(options.report, {
        title: options.workflowName ?? "OpenHarness workflow complete",
        repoFullName: `${options.owner}/${options.repo}`,
      });

  await postChannelMessage(options.botToken, mapping, content, options.replyToMessageId);
}
