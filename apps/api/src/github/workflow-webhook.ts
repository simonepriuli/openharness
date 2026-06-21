import type { Database } from "@openharness/db";
import { env } from "../env.js";
import {
  FIXER_MARKER,
  githubAppBotLogin,
  isFixerContent,
  MAX_WORKFLOW_ITERATIONS,
  PR_REVIEW_ACTIONS,
  type WorkflowType,
} from "./workflow-constants.js";
import {
  getPrIterationCount,
  insertWorkflowRun,
  isWorkflowEnabled,
  listConnectionsForRepo,
} from "./workflow-db.js";

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

type CommentPayload = {
  id: number;
  body?: string | null;
  user?: Sender | null;
  html_url?: string;
  in_reply_to_id?: number;
};

export type WorkflowWebhookPayload = {
  action?: string;
  installation?: { id: number };
  repository?: { owner?: { login?: string }; name?: string };
  pull_request?: PullRequestPayload;
  issue?: { number?: number; pull_request?: unknown };
  comment?: CommentPayload;
  sender?: Sender;
};

function extractOwnerRepo(payload: WorkflowWebhookPayload): { owner: string; repo: string } | null {
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  if (!owner || !repo) return null;
  return { owner, repo };
}

function isBotSender(sender: Sender | undefined, botLogin: string | null): boolean {
  if (!sender?.login || !botLogin) return false;
  return sender.login.toLowerCase() === botLogin.toLowerCase();
}

function shouldTriggerCommentFixer(
  payload: WorkflowWebhookPayload,
  botLogin: string | null,
): boolean {
  const comment = payload.comment;
  if (!comment?.body) return false;
  if (isFixerContent(comment.body)) return false;

  const sender = payload.sender ?? comment.user ?? undefined;
  if (isBotSender(sender, botLogin)) {
    return false;
  }

  return true;
}

async function enqueueForConnections(
  db: Database,
  options: {
    installationId: string;
    owner: string;
    repo: string;
    prNumber: number;
    workflowType: WorkflowType;
    event: string;
    deliveryId: string;
    payload: Record<string, unknown>;
  },
): Promise<number> {
  const connections = await listConnectionsForRepo(
    db,
    options.installationId,
    options.owner,
    options.repo,
  );

  let inserted = 0;
  for (const connection of connections) {
    const enabled = await isWorkflowEnabled(db, connection.id, options.workflowType);
    if (!enabled) continue;

    const iteration =
      (await getPrIterationCount(
        db,
        options.owner,
        options.repo,
        options.prNumber,
        options.workflowType,
      )) + 1;

    if (iteration > MAX_WORKFLOW_ITERATIONS) {
      continue;
    }

    const result = await insertWorkflowRun(db, {
      userId: connection.userId,
      projectGithubConnectionId: connection.id,
      projectPath: connection.projectPath,
      installationId: connection.installationId,
      githubOwner: options.owner,
      githubRepo: options.repo,
      prNumber: options.prNumber,
      workflowType: options.workflowType,
      event: options.event,
      deliveryId: `${options.deliveryId}:${connection.id}`,
      iteration,
      payload: options.payload,
    });
    if (result.inserted) inserted += 1;
  }

  return inserted;
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
  const installationIdStr = String(installationId);
  const action = payload.action ?? "";

  if (eventName === "pull_request") {
    if (!PR_REVIEW_ACTIONS.has(action)) return;
    const pr = payload.pull_request;
    if (!pr?.number) return;

    await enqueueForConnections(db, {
      installationId: installationIdStr,
      owner: ownerRepo.owner,
      repo: ownerRepo.repo,
      prNumber: pr.number,
      workflowType: "pr_review",
      event: action,
      deliveryId,
      payload: {
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
      },
    });
    return;
  }

  if (eventName === "issue_comment" && action === "created") {
    if (!payload.issue?.pull_request) return;
    if (!shouldTriggerCommentFixer(payload, botLogin)) return;

    const prNumber = payload.issue.number;
    if (!prNumber) return;

    await enqueueForConnections(db, {
      installationId: installationIdStr,
      owner: ownerRepo.owner,
      repo: ownerRepo.repo,
      prNumber,
      workflowType: "comment_fixer",
      event: action,
      deliveryId,
      payload: {
        comment: {
          id: payload.comment?.id,
          body: payload.comment?.body,
          htmlUrl: payload.comment?.html_url,
          inReplyToId: payload.comment?.in_reply_to_id,
        },
      },
    });
    return;
  }

  if (eventName === "pull_request_review_comment" && action === "created") {
    if (!shouldTriggerCommentFixer(payload, botLogin)) return;
    const pr = payload.pull_request;
    if (!pr?.number) return;

    await enqueueForConnections(db, {
      installationId: installationIdStr,
      owner: ownerRepo.owner,
      repo: ownerRepo.repo,
      prNumber: pr.number,
      workflowType: "comment_fixer",
      event: action,
      deliveryId,
      payload: {
        pullRequest: {
          number: pr.number,
          headRef: pr.head.ref,
          headSha: pr.head.sha,
          baseRef: pr.base.ref,
        },
        comment: {
          id: payload.comment?.id,
          body: payload.comment?.body,
          htmlUrl: payload.comment?.html_url,
          inReplyToId: payload.comment?.in_reply_to_id,
        },
      },
    });
  }
}

export { FIXER_MARKER };
