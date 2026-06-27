import type { WorkflowRunResultPayload } from "./openharness-api.js";
import { parseReviewDecision } from "./workflow-review-parse.js";
import { parseTeamsReport } from "./workflow-teams-parse.js";

const PR_REVIEW_EVENTS = new Set([
  "opened",
  "reopened",
  "ready_for_review",
  "synchronize",
  "review_submitted",
  "pr_opened",
  "pr_updated",
  "pr_ready",
  "pr_comment_on_diff",
]);

function genericSummary(assistantText: string): string {
  const withoutJson = assistantText.replace(/```json[\s\S]*?```/gi, "").trim();
  const firstParagraph =
    withoutJson
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .find(Boolean) ?? withoutJson;
  const summary = firstParagraph.trim();
  if (!summary) return "Workflow completed.";
  return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
}

function isBugTriageWorkflow(event: string, workflowType?: string | null): boolean {
  if (workflowType === "teams_bug_triage" || workflowType === "discord_bug_triage") return true;
  return event === "teams_mention" || event === "discord_mention";
}

function isPrReviewWorkflow(event: string, workflowType?: string | null): boolean {
  if (workflowType === "pr_review" || workflowType === "comment_fixer") return true;
  return PR_REVIEW_EVENTS.has(event);
}

function isCveWorkflow(event: string, workflowType?: string | null): boolean {
  if (workflowType === "dependency_cve_scan") return true;
  if (workflowType === "pr_review" || workflowType === "comment_fixer") return false;
  if (workflowType === "teams_bug_triage" || workflowType === "discord_bug_triage") return false;
  return event === "schedule" || event === "manual";
}

export function extractResultPayload(
  assistantText: string,
  event: string,
  workflowType?: string | null,
): WorkflowRunResultPayload {
  const trimmed = assistantText.trim();
  if (!trimmed) {
    return { kind: "generic", summary: "Workflow completed." };
  }

  if (isBugTriageWorkflow(event, workflowType)) {
    const report = parseTeamsReport(trimmed, "bug_triage");
    return {
      kind: "bug_triage",
      summary: report.summary,
      findings: report.kind === "bug_triage" ? report.findings : [],
      suggestedNextSteps: report.kind === "bug_triage" ? report.suggestedNextSteps : [],
    };
  }

  if (isPrReviewWorkflow(event, workflowType)) {
    try {
      const decision = parseReviewDecision(trimmed);
      return {
        kind: "pr_review",
        action: decision.action,
        summary: decision.summary,
        inlineCommentCount: decision.inlineComments.length,
      };
    } catch {
      return { kind: "generic", summary: genericSummary(trimmed) };
    }
  }

  if (isCveWorkflow(event, workflowType)) {
    const report = parseTeamsReport(trimmed, "cve_scan");
    return {
      kind: "cve_scan",
      summary: report.summary,
      vulnerabilities: report.kind === "cve_scan" ? report.vulnerabilities : [],
    };
  }

  return { kind: "generic", summary: genericSummary(trimmed) };
}

export function stripJsonBlocks(text: string): string {
  return text
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function fallbackResultMarkdown(assistantText: string): string {
  const stripped = stripJsonBlocks(assistantText).trim();
  if (!stripped) return "";
  return stripped.length > 16_000 ? `${stripped.slice(0, 15_997)}...` : stripped;
}
