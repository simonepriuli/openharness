import type { WorkflowTools } from "@openharness/shared/workflow-run";

export const DEFAULT_SCHEDULED_TOOLS: WorkflowTools = {
  prComment: false,
  prApprove: false,
  prPush: false,
  prCreate: false,
  teamsNotify: false,
  discordNotify: false,
};

export function defaultToolsForEvent(event: string): WorkflowTools {
  if (event === "review_submitted" || event === "pr_comment_on_diff") {
    return {
      prComment: true,
      prApprove: false,
      prPush: true,
      prCreate: false,
      teamsNotify: false,
    };
  }
  return {
    prComment: true,
    prApprove: true,
    prPush: false,
    prCreate: false,
    teamsNotify: false,
  };
}
