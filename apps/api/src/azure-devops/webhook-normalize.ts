import type { WorkflowTriggerEvent } from "../github/workflow-types.js";
import type { NormalizedWebhookEvent } from "../source-control/types.js";

const EVENT_MAP: Record<string, WorkflowTriggerEvent> = {
  "git.pullrequest.created": "pr_opened",
  "git.pullrequest.updated": "pr_updated",
  "ms.vss-code.git-pullrequest-comment-event": "pr_comment_on_diff",
  "ms.vss-code.git-pullrequest-review-event": "review_submitted",
};

type AdoWebhookPayload = {
  eventType?: string;
  id?: string;
  resource?: {
    pullRequestId?: number;
    repository?: {
      name?: string;
      project?: { name?: string };
    };
    comment?: { content?: string };
    reviewer?: { displayName?: string };
  };
};

export function normalizeAzureDevOpsWebhookEvent(
  body: unknown,
  headers: Record<string, string | undefined>,
): NormalizedWebhookEvent | null {
  const payload = body as AdoWebhookPayload;
  const eventType = payload.eventType;
  if (!eventType) return null;

  const event = EVENT_MAP[eventType];
  if (!event) return null;

  const namespace = payload.resource?.repository?.project?.name;
  const repoName = payload.resource?.repository?.name;
  const prNumber = payload.resource?.pullRequestId;

  if (!namespace || !repoName || !prNumber) return null;

  return {
    event,
    deliveryId: headers["x-vss-activityid"] ?? payload.id ?? `${eventType}:${prNumber}:${Date.now()}`,
    namespace,
    repoName,
    prNumber,
    payload: payload as unknown as Record<string, unknown>,
    connectionExternalId: namespace,
  };
}
