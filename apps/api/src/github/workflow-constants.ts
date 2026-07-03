import { randomUUID } from "node:crypto";
import type {
  WorkflowDiscordMentionTrigger,
  WorkflowGitPrTrigger,
  WorkflowLinearTrigger,
  WorkflowScheduleTrigger,
  WorkflowTeamsMentionTrigger,
  WorkflowTemplate,
  WorkflowTemplateId,
  WorkflowTrigger,
  WorkflowTriggerEvent,
  LinearTriggerEvent,
} from "./workflow-types.js";
import { DEFAULT_WORKFLOW_TIMEZONE } from "./workflow-types.js";

export const WORKFLOW_TYPES = [
  "pr_review",
  "comment_fixer",
  "dependency_cve_scan",
  "teams_bug_triage",
  "discord_bug_triage",
  "linear_issue_triage",
  "linear_comment_triage",
  "linear_issue_implementation",
] as const;
export type WorkflowType = (typeof WORKFLOW_TYPES)[number];

export const MAX_WORKFLOW_ITERATIONS = 5;
export const FIXER_MARKER = "<!-- openharness:fixer -->";
export const FIXER_COMMIT_TRAILER = "OpenHarness-Workflow: fixer";

export const PR_REVIEW_ACTIONS = new Set([
  "opened",
  "reopened",
  "ready_for_review",
  "synchronize",
]);

const PR_REVIEW_INSTRUCTIONS = `You are an automated PR reviewer for OpenHarness.

Review the pull request against the base branch.
Focus on bugs, security issues, missing tests, and maintainability problems in the changed code.
Read the relevant files in the worktree. The diff is included below for context.

When the pull request is ready to merge, approve it with a concise summary explaining why.
When changes are needed, submit a code review with a summary and precise inline comments anchored to changed lines in the diff.`;

const COMMENT_FIXER_INSTRUCTIONS = `You are an automated PR fixer for OpenHarness.

Fix the inline review feedback on the pull request in this worktree.
Make minimal, focused edits that address the comments. Run tests if appropriate.

After making changes, summarize what you fixed, then push your commits to the pull request branch on GitHub.`;

const DEPENDENCY_CVE_SCAN_INSTRUCTIONS = `Analyze the dependencies of this project. The goal is to find any related CVEs and security advisories.

Inventory dependencies from lockfiles and package manifests in the repository (for example package-lock.json, pnpm-lock.yaml, Cargo.lock, go.sum, requirements.txt, and similar files).

Search the web for known CVEs, security advisories, and severity information for the dependencies you find.

When finished, produce a vulnerability report in markdown with:
- A short executive summary
- A table of all dependencies at risk with columns: dependency, version, CVE/advisory, severity, and recommended action
- Notes on any dependencies you could not assess

When finished, post a concise vulnerability report summary to the Teams channel. Include key findings and recommended actions.`;

const TEAMS_BUG_TRIAGE_INSTRUCTIONS = `You are an automated bug triage agent for OpenHarness.

A user reported a bug via Microsoft Teams. Investigate the report using the repository worktree on the target branch.
Read relevant code, logs, and configuration to understand the issue described in the Teams message.

When finished, produce a concise investigation summary with findings and suggested next steps, then post it to the Teams channel.`;

const DISCORD_BUG_TRIAGE_INSTRUCTIONS = `You are an automated bug triage agent for OpenHarness.

A user reported a bug via Discord. Investigate the report using the repository worktree on the target branch.
Read relevant code, logs, and configuration to understand the issue described in the Discord message.

When finished, produce a concise investigation summary with findings and suggested next steps, then post it to the Discord channel.`;

const LINEAR_ISSUE_TRIAGE_INSTRUCTIONS = `You are an automated issue triage agent for OpenHarness.

A new Linear issue was created in a mapped project. Investigate the report using the repository worktree on the target branch.
Read relevant code, logs, and configuration to understand the issue described in the Linear issue context.

When finished, produce a concise investigation summary with findings and suggested next steps, then post it as a comment on the Linear issue.`;

const LINEAR_COMMENT_TRIAGE_INSTRUCTIONS = `You are an automated Linear assistant for OpenHarness.

Someone added a comment on a Linear issue in a mapped project. Read the triggering comment and issue context, then investigate using the repository worktree on the target branch when code changes are relevant.

When finished, reply on the Linear issue with a concise, actionable response.`;

const LINEAR_ISSUE_IMPLEMENTATION_INSTRUCTIONS = `You are an automated implementation agent for OpenHarness.

A Linear issue in a mapped project needs engineering work. Read the issue context, investigate the repository on the target branch, and implement a minimal focused fix.

When you have a working change, open or update a pull request, link it on the Linear issue, and post a short status comment on the issue summarizing what changed and what to review next.`;

function trigger(id: string, event: WorkflowTriggerEvent): WorkflowGitPrTrigger {
  return { id, kind: "git_pr", event };
}

function teamsMentionTrigger(id: string): WorkflowTeamsMentionTrigger {
  return { id, kind: "teams_mention" };
}

function discordMentionTrigger(id: string): WorkflowDiscordMentionTrigger {
  return { id, kind: "discord_mention" };
}

function linearTrigger(id: string, event: LinearTriggerEvent): WorkflowLinearTrigger {
  return { id, kind: "linear", event };
}

function scheduleTrigger(id: string): WorkflowScheduleTrigger {
  return {
    id,
    kind: "schedule",
    preset: "weekly",
    cronExpression: "0 9 * * 1",
    timezone: DEFAULT_WORKFLOW_TIMEZONE,
    label: "Weekly",
  };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "pr_review",
    name: "PR auto review",
    description:
      "When a pull request opens or updates, review the diff and comment on issues or approve if clean.",
    model: "",
    instructions: PR_REVIEW_INSTRUCTIONS,
    triggers: [
      trigger("pr-opened", "pr_opened"),
      trigger("pr-updated", "pr_updated"),
      trigger("pr-ready", "pr_ready"),
    ],
    tools: {
      prComment: true,
      prApprove: true,
      prPush: false,
      prCreate: false,
      teamsNotify: false,
    },
  },
  {
    id: "comment_fixer",
    name: "Autofix PR review comments",
    description:
      "When inline review comments are added on changed lines, apply fixes locally, push to the PR branch, and resolve threads.",
    model: "",
    instructions: COMMENT_FIXER_INSTRUCTIONS,
    triggers: [
      trigger("review-submitted", "review_submitted"),
      trigger("comment-on-diff", "pr_comment_on_diff"),
    ],
    tools: {
      prComment: true,
      prApprove: false,
      prPush: true,
      prCreate: false,
      teamsNotify: false,
    },
  },
  {
    id: "dependency_cve_scan",
    name: "Dependency CVE scan",
    description:
      "Weekly scan of project dependencies for known CVEs and security advisories, with a vulnerability report.",
    model: "",
    instructions: DEPENDENCY_CVE_SCAN_INSTRUCTIONS,
    triggers: [scheduleTrigger("weekly-cve-scan")],
    tools: {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: true,
      discordNotify: false,
    },
  },
  {
    id: "teams_bug_triage",
    name: "Teams bug triage",
    description:
      "When someone @mentions the OpenHarness bot in a mapped Teams channel, investigate the reported bug and reply with findings.",
    model: "",
    instructions: TEAMS_BUG_TRIAGE_INSTRUCTIONS,
    triggers: [teamsMentionTrigger("teams-mention")],
    tools: {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: true,
      discordNotify: false,
    },
  },
  {
    id: "discord_bug_triage",
    name: "Discord bug triage",
    description:
      "When someone triggers OpenHarness from a mapped Discord channel, investigate the reported bug and reply with findings.",
    model: "",
    instructions: DISCORD_BUG_TRIAGE_INSTRUCTIONS,
    triggers: [discordMentionTrigger("discord-mention")],
    tools: {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: false,
      discordNotify: true,
    },
  },
  {
    id: "linear_issue_triage",
    name: "Linear issue triage",
    description:
      "When a new issue is created in a mapped Linear project, investigate the report and comment findings on the issue.",
    model: "",
    instructions: LINEAR_ISSUE_TRIAGE_INSTRUCTIONS,
    triggers: [linearTrigger("linear-issue-created", "linear_issue_created")],
    tools: {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: false,
      discordNotify: false,
      linearRead: true,
      linearWrite: false,
      linearComments: true,
    },
  },
  {
    id: "linear_comment_triage",
    name: "Linear comment reply",
    description:
      "When someone comments on a mapped Linear issue, investigate if needed and post a concise reply on the issue.",
    model: "",
    instructions: LINEAR_COMMENT_TRIAGE_INSTRUCTIONS,
    triggers: [linearTrigger("linear-comment-created", "linear_comment_created")],
    tools: {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: false,
      discordNotify: false,
      linearRead: true,
      linearWrite: false,
      linearComments: true,
    },
  },
  {
    id: "linear_issue_implementation",
    name: "Linear issue implementation",
    description:
      "When a Linear issue is created in a mapped project, implement a focused fix, open a pull request, and update the issue.",
    model: "",
    instructions: LINEAR_ISSUE_IMPLEMENTATION_INSTRUCTIONS,
    triggers: [linearTrigger("linear-issue-created", "linear_issue_created")],
    tools: {
      prComment: true,
      prApprove: false,
      prPush: true,
      prCreate: true,
      teamsNotify: false,
      discordNotify: false,
      linearRead: true,
      linearWrite: true,
      linearComments: true,
    },
  },
];

export const WORKFLOW_TEMPLATE_MAP = new Map(
  WORKFLOW_TEMPLATES.map((template) => [template.id, template]),
);

export function getWorkflowTemplate(id: WorkflowTemplateId): WorkflowTemplate {
  const template = WORKFLOW_TEMPLATE_MAP.get(id);
  if (!template) throw new Error(`Unknown workflow template: ${id}`);
  return template;
}

export function createTriggersFromTemplate(id: WorkflowTemplateId): WorkflowTrigger[] {
  return getWorkflowTemplate(id).triggers.map((row) => ({
    ...row,
    id: randomUUID(),
  }));
}

/** @deprecated Use WORKFLOW_TEMPLATES */
export const DEFAULT_WORKFLOW_DEFINITIONS = WORKFLOW_TEMPLATES.map((template) => ({
  type: template.id,
  title: template.name,
  description: template.description,
}));

export function githubAppBotLogin(slug: string | undefined): string | null {
  if (!slug) return null;
  return `${slug}[bot]`;
}

export function isFixerContent(body: string | null | undefined): boolean {
  if (!body) return false;
  return body.includes(FIXER_MARKER);
}

export type CommentSender = {
  id?: string;
  login?: string;
  type?: string;
};

export type AutomationIdentity = {
  kind: "github_bot" | "ado_service_account";
  login?: string;
  id?: string;
  displayName?: string;
};

export type ReviewFixerTriggerInput = {
  review?: {
    id?: number;
    body?: string | null;
    state?: string;
  } | null;
  sender?: CommentSender;
};

export function isOpenHarnessAutomationSender(
  sender: CommentSender | undefined,
  identity: AutomationIdentity | null,
): boolean {
  if (!identity || !sender) return false;
  if (identity.kind === "github_bot" && identity.login && sender.login) {
    return sender.login.toLowerCase() === identity.login.toLowerCase();
  }
  if (identity.kind === "ado_service_account") {
    if (identity.id && sender.id && sender.id === identity.id) return true;
    if (identity.displayName && sender.login) {
      return sender.login.toLowerCase() === identity.displayName.toLowerCase();
    }
  }
  return false;
}

export function isOpenHarnessBotSender(
  sender: CommentSender | undefined,
  botLogin: string | null,
): boolean {
  if (!sender?.login || !botLogin) return false;
  return sender.login.toLowerCase() === botLogin.toLowerCase();
}

export function isAutomationSender(sender: CommentSender | undefined): boolean {
  if (!sender) return false;
  if (sender.type === "Bot") return true;
  if (sender.login && /\[bot\]$/i.test(sender.login)) return true;
  return false;
}

export function isCommentFixerWebhookEvent(eventName: string, action: string): boolean {
  return (
    (eventName === "pull_request_review" && action === "submitted") ||
    (eventName === "pull_request_review_comment" && action === "created")
  );
}

export function shouldTriggerCommentFixerForReview(
  input: ReviewFixerTriggerInput,
  identity: AutomationIdentity | null,
): boolean {
  const review = input.review;
  if (!review) return false;

  const state = (review.state ?? "").toLowerCase();
  if (state !== "commented" && state !== "changes_requested") return false;
  if (isFixerContent(review.body)) return false;

  const sender = input.sender;
  if (isOpenHarnessAutomationSender(sender, identity)) return true;
  if (isAutomationSender(sender)) return false;
  return true;
}

export function shouldTriggerCommentFixerForReviewComment(
  input: { comment?: { body?: string | null }; sender?: CommentSender },
  identity: AutomationIdentity | null,
): boolean {
  if (isFixerContent(input.comment?.body)) return false;
  const sender = input.sender;
  if (isOpenHarnessAutomationSender(sender, identity)) return true;
  if (isAutomationSender(sender)) return false;
  return true;
}
