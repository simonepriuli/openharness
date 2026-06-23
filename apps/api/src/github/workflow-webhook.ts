import type { Database } from "@openharness/db";
import { env } from "../env.js";
import {
  FIXER_MARKER,
  githubAppBotLogin,
  MAX_WORKFLOW_ITERATIONS,
} from "./workflow-constants.js";
import {
  getPrIterationCount,
  insertWorkflowRun,
  listConnectionsForRepo,
  listEnabledWorkflowsForConnection,
} from "./workflow-db.js";
import {
  normalizeGithubWorkflowEvent,
  workflowBranchMatches,
  workflowTriggerMatches,
} from "./workflow-trigger-match.js";

type PullRequestPayload = {
  number: number;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  title?: string;
  body?: string | null;
  draft?: boolean;
  html_url?: string;
};

type Sender = {
  login?: string;
  type?: string;
};

type ReviewPayload = {
  id?: number;
  body?: string | null;
  state?: string;
  user?: Sender | null;
};

type ReviewCommentPayload = {
  body?: string | null;
  user?: Sender | null;
};

export type WorkflowWebhookPayload = {
  action?: string;
  installation?: { id: number };
  repository?: { owner?: { login?: string }; name?: string };
  pull_request?: PullRequestPayload;
  issue?: { number?: number; pull_request?: unknown };
  review?: ReviewPayload;
  comment?: ReviewCommentPayload;
  sender?: Sender;
};

function extractOwnerRepo(payload: WorkflowWebhookPayload): { owner: string; repo: string } | null {
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  if (!owner || !repo) return null;
  return { owner, repo };
}

function buildRunPayload(
  payload: WorkflowWebhookPayload,
  pr: PullRequestPayload,
  options?: { review?: ReviewPayload },
): Record<string, unknown> {
  const base = {
    pullRequest: {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      draft: pr.draft,
      htmlUrl: pr.html_url,
      headRef: pr.head.ref,
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      baseSha: pr.base.sha,
    },
  };

  if (options?.review) {
    return {
      ...base,
      review: {
        id: options.review.id,
        state: options.review.state,
        body: options.review.body,
      },
    };
  }

  if (payload.comment) {
    return {
      ...base,
      comment: {
        body: payload.comment.body,
      },
    };
  }

  return base;
}

export async function handleWorkflowWebhookEvent(
  db: Database,
  eventName: string,
  deliveryId: string,
  payload: WorkflowWebhookPayload,
): Promise<void> {
  const installationId = payload.installation?.id;
  if (!installationId) return;

  const ownerRepo = extractOwnerRepo(payload);
  if (!ownerRepo) return;

  const botLogin = githubAppBotLogin(env.githubAppSlug());
  const identity = botLogin ? { kind: "github_bot" as const, login: botLogin } : null;
  const installationIdStr = String(installationId);
  const action = payload.action ?? "";
  const pr = payload.pull_request;
  if (!pr?.number) return;

  const normalized = normalizeGithubWorkflowEvent(eventName, action, {
    review: payload.review,
    sender: payload.sender ?? payload.review?.user ?? undefined,
    comment: payload.comment,
    prBaseRef: pr.base.ref,
  });
  if (!normalized) return;

  const connections = await listConnectionsForRepo(
    db,
    installationIdStr,
    ownerRepo.owner,
    ownerRepo.repo,
  );

  for (const connection of connections) {
    const workflows = await listEnabledWorkflowsForConnection(db, connection.id);
    for (const workflowRecord of workflows) {
      if (!workflowBranchMatches(workflowRecord.targetBranch, pr.base.ref)) continue;

      const matchedTrigger = workflowRecord.triggers.find(
        (trigger) =>
          trigger.kind === "git_pr" &&
          workflowTriggerMatches(trigger, normalized, identity),
      );
      if (!matchedTrigger || matchedTrigger.kind !== "git_pr") continue;

      const iteration =
        (await getPrIterationCount(
          db,
          ownerRepo.owner,
          ownerRepo.repo,
          pr.number,
          workflowRecord.id,
        )) + 1;

      if (iteration > MAX_WORKFLOW_ITERATIONS) continue;

      await insertWorkflowRun(db, {
        organizationId: connection.organizationId,
        userId: connection.userId,
        workflowId: workflowRecord.id,
        workflowType: null,
        projectSourceControlConnectionId: connection.id,
        connectionId: connection.connectionId,
        provider: connection.provider,
        namespace: ownerRepo.owner,
        repoName: ownerRepo.repo,
        prNumber: pr.number,
        event: matchedTrigger.event,
        deliveryId: `${deliveryId}:${connection.id}:${workflowRecord.id}:${matchedTrigger.id}`,
        iteration,
        payload: {
          ...buildRunPayload(payload, pr, { review: payload.review }),
          workflow: {
            id: workflowRecord.id,
            name: workflowRecord.name,
            model: workflowRecord.model,
            instructions: workflowRecord.instructions,
            tools: workflowRecord.tools,
            triggerEvent: matchedTrigger.event,
          },
        },
      });
    }
  }
}

export { FIXER_MARKER };
