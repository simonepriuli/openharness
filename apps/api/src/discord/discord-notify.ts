import type { Database } from "@openharness/db";
import type { CveVulnerability, TeamsReport } from "../github/workflow-teams-parse.js";
import { findDiscordMappingForRepo, type DiscordChannelRepoMappingRecord } from "./discord-db.js";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_MAX_CONTENT_LENGTH = 2000;
const DISCORD_MAX_SUMMARY_LENGTH = 600;
const DISCORD_MAX_ADVISORY_LENGTH = 100;
const DISCORD_MAX_ACTION_LENGTH = 80;
const DISCORD_MAX_VULNERABILITIES = 8;

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function renderCveVulnerabilityLine(vuln: CveVulnerability): string {
  const sev = vuln.severity ? ` (${vuln.severity})` : "";
  const advisory = vuln.advisory ? ` - ${clip(vuln.advisory, DISCORD_MAX_ADVISORY_LENGTH)}` : "";
  const action = vuln.action ? ` -> ${clip(vuln.action, DISCORD_MAX_ACTION_LENGTH)}` : "";
  return `- \`${vuln.dependency}\`${sev}${advisory}${action}`;
}

export function chunkDiscordContent(lines: string[]): string[] {
  const messages: string[] = [];
  let current = "";

  for (const line of lines) {
    const separator = current.length > 0 ? "\n" : "";
    const candidate = `${current}${separator}${line}`;
    if (candidate.length > DISCORD_MAX_CONTENT_LENGTH) {
      if (current) messages.push(current);
      current =
        line.length > DISCORD_MAX_CONTENT_LENGTH
          ? clip(line, DISCORD_MAX_CONTENT_LENGTH)
          : line;
    } else {
      current = candidate;
    }
  }

  if (current) messages.push(current);
  return messages.length > 0 ? messages : [""];
}

export function renderDiscordReportMessages(
  report: TeamsReport,
  options: { title: string; repoFullName: string },
): string[] {
  const header = [
    `**${options.title}**`,
    `Repository: \`${options.repoFullName}\``,
    "",
    clip(report.summary, DISCORD_MAX_SUMMARY_LENGTH),
    "",
  ];

  if (report.kind === "cve_scan") {
    const vulnerabilities = report.vulnerabilities ?? [];
    const visible = vulnerabilities.slice(0, DISCORD_MAX_VULNERABILITIES);
    const vulnLines =
      visible.length > 0
        ? ["**Vulnerabilities**", ...visible.map(renderCveVulnerabilityLine)]
        : ["No known vulnerable dependencies detected."];
    if (vulnerabilities.length > visible.length) {
      vulnLines.push(
        `_+ ${vulnerabilities.length - visible.length} more (see OpenHarness for the full report)_`,
      );
    }
    return chunkDiscordContent([...header, ...vulnLines]);
  }

  const findings = report.findings ?? [];
  const suggestedNextSteps = report.suggestedNextSteps ?? [];
  const body = [...header];
  if (findings.length > 0) {
    body.push("**Findings**", ...findings.slice(0, 6).map((finding) => `- ${clip(finding, 300)}`));
  }
  if (suggestedNextSteps.length > 0) {
    body.push(
      "",
      "**Suggested next steps**",
      ...suggestedNextSteps.slice(0, 4).map((step) => `- ${clip(step, 300)}`),
    );
  }
  return chunkDiscordContent(body);
}

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
  if (!mapping) {
    console.warn(
      `[discord-notify] no channel mapping for ${options.owner}/${options.repo} (org ${options.organizationId})`,
    );
    return;
  }

  const messages = options.failed
    ? [
        `**Workflow failed**\nRepository: \`${options.owner}/${options.repo}\`\n\n${options.errorMessage ?? "Workflow failed."}`,
      ]
    : renderDiscordReportMessages(options.report, {
        title: options.workflowName ?? "OpenHarness workflow complete",
        repoFullName: `${options.owner}/${options.repo}`,
      });

  for (const [index, content] of messages.entries()) {
    await postChannelMessage(
      options.botToken,
      mapping,
      content,
      index === 0 ? options.replyToMessageId : undefined,
    );
  }
}
