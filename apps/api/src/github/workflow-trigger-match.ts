import type { WorkflowTrigger, WorkflowTriggerEvent, WorkflowLinearTrigger, LinearTriggerEvent } from "./workflow-types.js";
import {
  PR_REVIEW_ACTIONS,
  shouldTriggerCommentFixerForReview,
  shouldTriggerCommentFixerForReviewComment,
  type AutomationIdentity,
  type ReviewFixerTriggerInput,
} from "./workflow-constants.js";

export type NormalizedTeamsWorkflowEvent = {
  eventName: "teams_message";
  action: "mention";
  teamsMention: true;
};

export type NormalizedWorkflowEvent = {
  eventName: string;
  action: string;
  triggerEvents: WorkflowTriggerEvent[];
  prBaseRef?: string;
  reviewInput?: ReviewFixerTriggerInput;
  reviewCommentInput?: {
    comment?: { body?: string | null };
    sender?: { id?: string; login?: string; type?: string };
  };
  teamsMention?: boolean;
  discordMention?: boolean;
  linearEvent?: LinearTriggerEvent;
  linearProjectId?: string;
  linearTeamId?: string;
  linearLabelIds?: string[];
};

export function normalizeGithubWorkflowEvent(
  eventName: string,
  action: string,
  payload: {
    review?: ReviewFixerTriggerInput["review"];
    sender?: ReviewFixerTriggerInput["sender"];
    comment?: { body?: string | null };
    prBaseRef?: string;
  },
): NormalizedWorkflowEvent | null {
  if (eventName === "pull_request") {
    const triggerEvents: WorkflowTriggerEvent[] = [];
    if (action === "opened") triggerEvents.push("pr_opened");
    if (action === "ready_for_review" || action === "reopened") {
      triggerEvents.push("pr_ready");
    }
    if (PR_REVIEW_ACTIONS.has(action)) {
      triggerEvents.push("pr_updated");
      if (action === "opened") triggerEvents.push("pr_opened");
      if (action === "ready_for_review") triggerEvents.push("pr_ready");
    }
    if (triggerEvents.length === 0) return null;
    return {
      eventName,
      action,
      triggerEvents: [...new Set(triggerEvents)],
      prBaseRef: payload.prBaseRef,
    };
  }

  if (eventName === "pull_request_review" && action === "submitted") {
    return {
      eventName,
      action,
      triggerEvents: ["review_submitted"],
      prBaseRef: payload.prBaseRef,
      reviewInput: {
        review: payload.review,
        sender: payload.sender,
      },
    };
  }

  if (eventName === "pull_request_review_comment" && action === "created") {
    return {
      eventName,
      action,
      triggerEvents: ["pr_comment_on_diff"],
      prBaseRef: payload.prBaseRef,
      reviewCommentInput: {
        comment: payload.comment,
        sender: payload.sender,
      },
    };
  }

  return null;
}

export function workflowBranchMatches(
  targetBranch: string,
  prBaseRef: string | undefined,
): boolean {
  const branch = targetBranch.trim();
  if (!branch) return true;
  if (!prBaseRef) return false;
  return prBaseRef.toLowerCase() === branch.toLowerCase();
}

export function workflowTriggerMatches(
  trigger: WorkflowTrigger,
  normalized: NormalizedWorkflowEvent,
  identity: AutomationIdentity | null,
): boolean {
  if (trigger.kind === "teams_mention") {
    return normalized.teamsMention === true;
  }
  if (trigger.kind === "discord_mention") {
    return normalized.discordMention === true;
  }
  if (trigger.kind === "linear") {
    if (normalized.linearEvent !== trigger.event) return false;
    return workflowLinearTriggerMatches(trigger, {
      event: trigger.event,
      projectId: normalized.linearProjectId,
      teamId: normalized.linearTeamId,
      labelIds: normalized.linearLabelIds,
    });
  }

  if (trigger.kind !== "git_pr") return false;
  if (!normalized.triggerEvents.includes(trigger.event)) return false;

  if (trigger.event === "review_submitted") {
    if (!normalized.reviewInput) return false;
    return shouldTriggerCommentFixerForReview(normalized.reviewInput, identity);
  }

  if (trigger.event === "pr_comment_on_diff") {
    if (!normalized.reviewCommentInput) return false;
    return shouldTriggerCommentFixerForReviewComment(normalized.reviewCommentInput, identity);
  }

  const commentAuthor = trigger.filters?.commentAuthor ?? "anyone";
  if (commentAuthor === "non_bot" && normalized.reviewInput?.sender) {
    const sender = normalized.reviewInput.sender;
    if (sender.type === "Bot" || (sender.login && /\[bot\]$/i.test(sender.login))) {
      return false;
    }
  }

  return true;
}

export function workflowLinearTriggerMatches(
  trigger: WorkflowLinearTrigger,
  context: {
    event: LinearTriggerEvent;
    projectId?: string | null;
    teamId?: string | null;
    labelIds?: string[];
  },
): boolean {
  if (trigger.event !== context.event) return false;

  const filters = trigger.filters;
  if (!filters) return true;

  if (filters.projectId && filters.projectId !== context.projectId) return false;
  if (filters.teamId && filters.teamId !== context.teamId) return false;
  if (filters.labelIds?.length) {
    const issueLabels = new Set(context.labelIds ?? []);
    if (!filters.labelIds.every((labelId) => issueLabels.has(labelId))) return false;
  }

  return true;
}
