export const WORKFLOW_RUN_STATUSES = ["pending", "claimed", "running", "done", "failed"] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export type WorkflowTools = {
  prComment: boolean;
  prApprove: boolean;
  prPush: boolean;
  prCreate: boolean;
  teamsNotify: boolean;
  discordNotify?: boolean;
  linearRead?: boolean;
  linearWrite?: boolean;
  linearComments?: boolean;
};

export type WorkflowConfigSnapshot = {
  id: string;
  name: string;
  model: string;
  instructions: string;
  tools: WorkflowTools;
  triggerEvent:
    | "pr_opened"
    | "pr_updated"
    | "pr_ready"
    | "pr_comment_on_diff"
    | "review_submitted"
    | "teams_mention"
    | "discord_mention"
    | "linear_issue_created"
    | "linear_issue_updated"
    | "linear_comment_created"
    | "schedule"
    | "manual";
};

export type CveVulnerability = {
  dependency: string;
  version?: string;
  advisory?: string;
  severity?: string;
  action?: string;
};

export type WorkflowRunResultPayload =
  | {
      kind: "cve_scan";
      summary: string;
      vulnerabilities: CveVulnerability[];
    }
  | {
      kind: "bug_triage";
      summary: string;
      findings: string[];
      suggestedNextSteps: string[];
    }
  | {
      kind: "pr_review";
      action: "approve" | "comment";
      summary: string;
      inlineCommentCount: number;
    }
  | {
      kind: "generic";
      summary: string;
    };

export type SourceControlProviderId = "github" | "azure_devops";

export type WorkflowRunExecutionRecord = {
  id: string;
  workflowId: string | null;
  workflowType?: string | null;
  projectSourceControlConnectionId?: string;
  projectPath: string | null;
  provider?: SourceControlProviderId;
  namespace?: string;
  repoName?: string;
  githubOwner: string;
  githubRepo: string;
  prNumber: number;
  event: string;
  iteration: number;
  payload: Record<string, unknown>;
  createdAt: string;
};

export function parseModelRef(model: string): { provider: string; modelId: string } | null {
  const trimmed = model.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) return null;
  return {
    provider: trimmed.slice(0, slash),
    modelId: trimmed.slice(slash + 1),
  };
}
