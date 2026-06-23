import type { NormalizedWorkflowEvent } from "../github/workflow-trigger-match.js";
import type { NormalizedWebhookEvent } from "../source-control/types.js";

export function normalizeAdoWorkflowTriggerInput(
  event: NormalizedWebhookEvent,
): NormalizedWorkflowEvent | null {
  const triggerEvent = event.event;
  if (triggerEvent === "teams_mention" || triggerEvent === "discord_mention") return null;

  const resource = event.payload.resource as {
    comment?: {
      content?: string;
      author?: { id?: string; displayName?: string; uniqueName?: string };
    };
    reviewer?: {
      id?: string;
      displayName?: string;
      uniqueName?: string;
      vote?: number;
    };
  } | undefined;

  const prBaseRef =
    (event.payload.pullRequest as { baseRef?: string } | undefined)?.baseRef ??
    (
      event.payload.resource as {
        pullRequest?: { targetRefName?: string };
      }
    )?.pullRequest?.targetRefName?.replace(/^refs\/heads\//, "");

  if (triggerEvent === "review_submitted") {
    const vote = resource?.reviewer?.vote ?? 0;
    let state = "commented";
    if (vote === 10) state = "approved";
    if (vote === -10) state = "changes_requested";

    return {
      eventName: event.event,
      action: event.event,
      triggerEvents: ["review_submitted"],
      prBaseRef,
      reviewInput: {
        review: { state, body: null },
        sender: {
          id: resource?.reviewer?.id,
          login:
            resource?.reviewer?.displayName ??
            resource?.reviewer?.uniqueName ??
            undefined,
        },
      },
    };
  }

  if (triggerEvent === "pr_comment_on_diff") {
    return {
      eventName: event.event,
      action: event.event,
      triggerEvents: ["pr_comment_on_diff"],
      prBaseRef,
      reviewCommentInput: {
        comment: { body: resource?.comment?.content ?? null },
        sender: {
          id: resource?.comment?.author?.id,
          login:
            resource?.comment?.author?.displayName ??
            resource?.comment?.author?.uniqueName ??
            undefined,
        },
      },
    };
  }

  return {
    eventName: event.event,
    action: event.event,
    triggerEvents: [triggerEvent],
    prBaseRef,
  };
}
