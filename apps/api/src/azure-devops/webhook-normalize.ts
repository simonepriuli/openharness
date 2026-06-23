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
  resourceContainers?: {
    account?: { name?: string };
    collection?: { baseUrl?: string };
    project?: { name?: string };
  };
  resource?: {
    pullRequestId?: number;
    pullRequest?: {
      pullRequestId?: number;
      sourceRefName?: string;
      targetRefName?: string;
      title?: string;
      description?: string;
      lastMergeSourceCommit?: { commitId?: string };
      lastMergeTargetCommit?: { commitId?: string };
    };
    repository?: {
      name?: string;
      project?: { name?: string };
    };
    comment?: {
      id?: number;
      content?: string;
      author?: { id?: string; displayName?: string; uniqueName?: string };
    };
    reviewer?: {
      id?: string;
      displayName?: string;
      uniqueName?: string;
      vote?: number;
    };
  };
};

function extractOrgName(payload: AdoWebhookPayload): string | undefined {
  const accountName = payload.resourceContainers?.account?.name?.trim();
  if (accountName) return accountName.toLowerCase();

  const baseUrl = payload.resourceContainers?.collection?.baseUrl;
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      const parts = parsed.pathname.replace(/^\//, "").split("/");
      if (parts[0]) return parts[0].toLowerCase();
    } catch {
      // ignore
    }
  }

  return undefined;
}

export function normalizeAzureDevOpsWebhookEvent(
  body: unknown,
  headers: Record<string, string | undefined>,
): NormalizedWebhookEvent | null {
  const payload = body as AdoWebhookPayload;
  const eventType = payload.eventType;
  if (!eventType) return null;

  const event = EVENT_MAP[eventType];
  if (!event) return null;

  const namespace =
    payload.resource?.repository?.project?.name ?? payload.resourceContainers?.project?.name;
  const repoName = payload.resource?.repository?.name;
  const prNumber =
    payload.resource?.pullRequestId ?? payload.resource?.pullRequest?.pullRequestId;

  if (!namespace || !repoName || !prNumber) return null;

  const orgName = extractOrgName(payload);

  return {
    event,
    deliveryId: headers["x-vss-activityid"] ?? payload.id ?? `${eventType}:${prNumber}:${Date.now()}`,
    namespace,
    repoName,
    prNumber,
    payload: payload as unknown as Record<string, unknown>,
    connectionExternalId: orgName,
  };
}
