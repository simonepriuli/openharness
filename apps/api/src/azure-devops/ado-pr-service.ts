import { and, eq, sql } from "@openharness/db";
import { projectSourceControlConnection } from "@openharness/db/schema";
import type { Database } from "@openharness/db";
import type {
  AutomationIdentity,
  GitCredentials,
  InlineCommentInput,
  PrContext,
  PrContextFile,
  PrContextThread,
  SubmitReviewInput,
} from "../source-control/pr-context.js";
import { AzureDevOpsClient } from "./client.js";
import { enrichAdoRunPayload } from "./run-payload.js";
import { normalizeAdoWorkflowTriggerInput } from "./trigger-input.js";
import { getAdoClientForOrg, getAdoConnectionForOrg } from "./service-hooks.js";
import type { NormalizedWebhookEvent } from "../source-control/types.js";

function refToBranch(ref: string | undefined): string {
  return (ref ?? "").replace(/^refs\/heads\//, "");
}

async function resolveProjectConnection(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
) {
  const rows = await db
    .select()
    .from(projectSourceControlConnection)
    .where(
      and(
        eq(projectSourceControlConnection.organizationId, organizationId),
        eq(projectSourceControlConnection.provider, "azure_devops"),
        sql`lower(${projectSourceControlConnection.namespace}) = ${namespace.toLowerCase()}`,
        sql`lower(${projectSourceControlConnection.name}) = ${repoName.toLowerCase()}`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getClientContext(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
) {
  const ctx = await getAdoClientForOrg(db, organizationId);
  if (!ctx) throw new Error("azure_devops_not_connected");
  const projectConn = await resolveProjectConnection(db, organizationId, namespace, repoName);
  return { ...ctx, projectConn };
}

async function latestIterationContext(
  client: AzureDevOpsClient,
  namespace: string,
  repoName: string,
  prNumber: number,
) {
  const iterations = await client.listPullRequestIterations(namespace, repoName, prNumber);
  if (iterations.length === 0) return null;
  const latest = iterations[iterations.length - 1]!;
  const first = iterations[0]!;
  return {
    changeTrackingId: latest.changeTrackingId ?? latest.id,
    firstComparingIteration: first.id,
    secondComparingIteration: latest.id,
    iterationId: latest.id,
  };
}

export async function adoGetAutomationIdentity(
  db: Database,
  organizationId: string,
): Promise<AutomationIdentity | null> {
  const connection = await getAdoConnectionForOrg(db, organizationId);
  if (!connection) return null;
  const metadata = (connection.metadata ?? {}) as {
    authenticatedUser?: string;
    automationUserId?: string;
  };
  return {
    kind: "ado_service_account",
    id: metadata.automationUserId,
    displayName: metadata.authenticatedUser,
  };
}

export async function adoEnrichRunPayload(
  db: Database,
  organizationId: string,
  event: NormalizedWebhookEvent,
): Promise<Record<string, unknown>> {
  const ctx = await getAdoClientForOrg(db, organizationId);
  if (!ctx) return event.payload;
  return enrichAdoRunPayload(ctx.client, event);
}

export async function adoFetchGitCredentials(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
): Promise<GitCredentials> {
  const { client, connection, projectConn } = await getClientContext(
    db,
    organizationId,
    namespace,
    repoName,
  );
  void client;
  const pat = connection.credentialsEncrypted
    ? (await import("../teams/teams-crypto.js")).decryptSecret(connection.credentialsEncrypted)
    : "";
  const remoteUrl =
    projectConn?.remoteUrl ??
    `https://dev.azure.com/${connection.externalOrgId}/${encodeURIComponent(namespace)}/_git/${encodeURIComponent(repoName)}`;
  return {
    username: "",
    token: pat,
    remoteUrl,
  };
}

export async function adoFetchPrContext(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
): Promise<PrContext> {
  const { client } = await getClientContext(db, organizationId, namespace, repoName);
  const pr = await client.getPullRequest(namespace, repoName, prNumber);
  const iterationCtx = await latestIterationContext(client, namespace, repoName, prNumber);

  let files: PrContextFile[] = [];
  if (iterationCtx) {
    const changes = await client.listPullRequestChanges(
      namespace,
      repoName,
      prNumber,
      iterationCtx.iterationId,
    );
    files = changes
      .map((change) => change.item?.path)
      .filter((path): path is string => Boolean(path))
      .map((path) => ({ path: path.replace(/^\//, ""), patch: null }));
  }

  const rawThreads = await client.listPullRequestThreads(namespace, repoName, prNumber);
  const threads: PrContextThread[] = rawThreads.map((thread) => ({
    id: String(thread.id),
    isResolved: thread.status === 2,
    path: thread.threadContext?.filePath?.replace(/^\//, ""),
    line: thread.threadContext?.rightFileStart?.line,
    comments: (thread.comments ?? []).map((comment) => ({
      id: String(comment.id),
      body: comment.content ?? "",
      authorId: comment.author?.id,
      authorName: comment.author?.displayName,
    })),
  }));

  const issueComments = threads
    .filter((thread) => !thread.path)
    .flatMap((thread) => thread.comments);

  const diff = await client.getPullRequestDiff(namespace, repoName, prNumber).catch(() => "");

  return {
    provider: "azure_devops",
    pullRequest: {
      number: prNumber,
      title: pr.title ?? "",
      body: pr.description ?? null,
      url: pr.url ?? "",
      headRef: refToBranch(pr.sourceRefName),
      headSha: pr.lastMergeSourceCommit?.commitId ?? "",
      baseRef: refToBranch(pr.targetRefName),
      baseSha: pr.lastMergeTargetCommit?.commitId ?? "",
    },
    files,
    diff,
    threads,
    issueComments,
  };
}

export async function adoSubmitReview(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
  input: SubmitReviewInput,
): Promise<void> {
  const { client } = await getClientContext(db, organizationId, namespace, repoName);
  if (input.event === "APPROVE") {
    const reviewerId = await client.getCurrentUserDescriptor();
    await client.approvePullRequest(namespace, repoName, prNumber, reviewerId);
    if (input.body.trim()) {
      await client.createPullRequestThread(namespace, repoName, prNumber, input.body);
    }
    return;
  }

  if (input.comments?.length) {
    const iteration = await latestIterationContext(client, namespace, repoName, prNumber);
    for (const comment of input.comments) {
      await client.createPullRequestThread(namespace, repoName, prNumber, comment.body, {
        threadContext: { filePath: comment.path, line: comment.line },
        pullRequestThreadContext: iteration
          ? {
              changeTrackingId: iteration.changeTrackingId,
              firstComparingIteration: iteration.firstComparingIteration,
              secondComparingIteration: iteration.secondComparingIteration,
            }
          : undefined,
      });
    }
  }

  if (input.body.trim()) {
    await client.createPullRequestThread(namespace, repoName, prNumber, input.body);
  }
}

export async function adoCreateInlineComment(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
  input: InlineCommentInput,
): Promise<void> {
  const { client } = await getClientContext(db, organizationId, namespace, repoName);
  const iteration = await latestIterationContext(client, namespace, repoName, prNumber);
  await client.createPullRequestThread(namespace, repoName, prNumber, input.body, {
    threadContext: { filePath: input.path, line: input.line },
    pullRequestThreadContext: iteration
      ? {
          changeTrackingId: iteration.changeTrackingId,
          firstComparingIteration: iteration.firstComparingIteration,
          secondComparingIteration: iteration.secondComparingIteration,
        }
      : undefined,
  });
}

export async function adoReplyToThread(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
  threadId: string,
  body: string,
): Promise<void> {
  const { client } = await getClientContext(db, organizationId, namespace, repoName);
  await client.replyToPullRequestThread(
    namespace,
    repoName,
    prNumber,
    Number(threadId),
    body,
  );
}

export async function adoResolveThread(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
  threadId: string,
): Promise<void> {
  const { client } = await getClientContext(db, organizationId, namespace, repoName);
  await client.resolvePullRequestThread(namespace, repoName, prNumber, Number(threadId));
}

export async function adoPostIssueComment(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
  body: string,
): Promise<void> {
  const { client } = await getClientContext(db, organizationId, namespace, repoName);
  await client.createPullRequestThread(namespace, repoName, prNumber, body);
}

export { normalizeAdoWorkflowTriggerInput };
