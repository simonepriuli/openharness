import { Result } from "better-result";
import { and, eq, sql } from "@openharness/db";
import { projectSourceControlConnection } from "@openharness/db/schema";
import type { Database } from "@openharness/db";
import { AzureDevOpsApiError } from "../errors.js";
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

function adoNotConnectedError(): AzureDevOpsApiError {
  return new AzureDevOpsApiError({ message: "azure_devops_not_connected" });
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
  if (!ctx) return Result.err(adoNotConnectedError());
  const projectConn = await resolveProjectConnection(db, organizationId, namespace, repoName);
  return Result.ok({ ...ctx, projectConn });
}

async function latestIterationContext(
  client: AzureDevOpsClient,
  namespace: string,
  repoName: string,
  prNumber: number,
): Promise<
  Result<
    {
      changeTrackingId: number;
      firstComparingIteration: number;
      secondComparingIteration: number;
      iterationId: number;
    } | null,
    AzureDevOpsApiError
  >
> {
  const iterationsResult = await client.listPullRequestIterations(namespace, repoName, prNumber);
  if (Result.isError(iterationsResult)) return iterationsResult;

  const iterations = iterationsResult.value;
  if (iterations.length === 0) return Result.ok(null);

  const latest = iterations[iterations.length - 1]!;
  const first = iterations[0]!;
  return Result.ok({
    changeTrackingId: latest.changeTrackingId ?? latest.id,
    firstComparingIteration: first.id,
    secondComparingIteration: latest.id,
    iterationId: latest.id,
  });
}

function pullRequestThreadContext(
  iteration: {
    changeTrackingId: number;
    firstComparingIteration: number;
    secondComparingIteration: number;
  } | null,
) {
  return iteration
    ? {
        changeTrackingId: iteration.changeTrackingId,
        firstComparingIteration: iteration.firstComparingIteration,
        secondComparingIteration: iteration.secondComparingIteration,
      }
    : undefined;
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

  const enriched = await enrichAdoRunPayload(ctx.client, event);
  if (Result.isError(enriched)) return event.payload;
  return enriched.value;
}

export async function adoFetchGitCredentials(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
): Promise<Result<GitCredentials, AzureDevOpsApiError>> {
  return Result.gen(async function* () {
    const { connection, projectConn } = yield* Result.await(
      getClientContext(db, organizationId, namespace, repoName),
    );

    const pat = connection.credentialsEncrypted
      ? (await import("../teams/teams-crypto.js")).decryptSecret(connection.credentialsEncrypted)
      : "";
    const remoteUrl =
      projectConn?.remoteUrl ??
      `https://dev.azure.com/${connection.externalOrgId}/${encodeURIComponent(namespace)}/_git/${encodeURIComponent(repoName)}`;
    return Result.ok({
      username: "",
      token: pat,
      remoteUrl,
    } satisfies GitCredentials);
  });
}

export async function adoFetchPrContext(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
): Promise<Result<PrContext, AzureDevOpsApiError>> {
  return Result.gen(async function* () {
      const { client } = yield* Result.await(getClientContext(db, organizationId, namespace, repoName));
      const pr = yield* Result.await(client.getPullRequest(namespace, repoName, prNumber));
      const iterationCtx = yield* Result.await(
        latestIterationContext(client, namespace, repoName, prNumber),
      );

      let files: PrContextFile[] = [];
      if (iterationCtx) {
        const changes = yield* Result.await(
          client.listPullRequestChanges(namespace, repoName, prNumber, iterationCtx.iterationId),
        );
        files = changes
          .map((change) => change.item?.path)
          .filter((path): path is string => Boolean(path))
          .map((path) => ({ path: path.replace(/^\//, ""), patch: null }));
      }

      const rawThreads = yield* Result.await(
        client.listPullRequestThreads(namespace, repoName, prNumber),
      );
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

      const diffResult = await client.getPullRequestDiff(namespace, repoName, prNumber);
      const diff = Result.isError(diffResult) ? "" : diffResult.value;

      return Result.ok({
        provider: "azure_devops" as const,
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
      } satisfies PrContext);
  });
}

export async function adoSubmitReview(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
  input: SubmitReviewInput,
): Promise<Result<void, AzureDevOpsApiError>> {
  return Result.gen(async function* () {
    const { client } = yield* Result.await(getClientContext(db, organizationId, namespace, repoName));

    if (input.event === "APPROVE") {
      const reviewerId = yield* Result.await(client.getCurrentUserDescriptor());
      yield* Result.await(client.approvePullRequest(namespace, repoName, prNumber, reviewerId));
      if (input.body.trim()) {
        yield* Result.await(
          client.createPullRequestThread(namespace, repoName, prNumber, input.body),
        );
      }
      return Result.ok(undefined);
    }

    if (input.comments?.length) {
      const iteration = yield* Result.await(
        latestIterationContext(client, namespace, repoName, prNumber),
      );
      for (const comment of input.comments) {
        yield* Result.await(
          client.createPullRequestThread(namespace, repoName, prNumber, comment.body, {
            threadContext: { filePath: comment.path, line: comment.line },
            pullRequestThreadContext: pullRequestThreadContext(iteration),
          }),
        );
      }
    }

    if (input.body.trim()) {
      yield* Result.await(
        client.createPullRequestThread(namespace, repoName, prNumber, input.body),
      );
    }
    return Result.ok(undefined);
  });
}

export async function adoCreateInlineComment(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
  input: InlineCommentInput,
): Promise<Result<void, AzureDevOpsApiError>> {
  return Result.gen(async function* () {
    const { client } = yield* Result.await(getClientContext(db, organizationId, namespace, repoName));
    const iteration = yield* Result.await(
      latestIterationContext(client, namespace, repoName, prNumber),
    );
    yield* Result.await(
      client.createPullRequestThread(namespace, repoName, prNumber, input.body, {
        threadContext: { filePath: input.path, line: input.line },
        pullRequestThreadContext: pullRequestThreadContext(iteration),
      }),
    );
    return Result.ok(undefined);
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
): Promise<Result<void, AzureDevOpsApiError>> {
  return Result.gen(async function* () {
    const { client } = yield* Result.await(getClientContext(db, organizationId, namespace, repoName));
    yield* Result.await(
      client.replyToPullRequestThread(namespace, repoName, prNumber, Number(threadId), body),
    );
    return Result.ok(undefined);
  });
}

export async function adoResolveThread(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
  threadId: string,
): Promise<Result<void, AzureDevOpsApiError>> {
  return Result.gen(async function* () {
    const { client } = yield* Result.await(getClientContext(db, organizationId, namespace, repoName));
    yield* Result.await(
      client.resolvePullRequestThread(namespace, repoName, prNumber, Number(threadId)),
    );
    return Result.ok(undefined);
  });
}

export async function adoPostIssueComment(
  db: Database,
  organizationId: string,
  namespace: string,
  repoName: string,
  prNumber: number,
  body: string,
): Promise<Result<void, AzureDevOpsApiError>> {
  return Result.gen(async function* () {
    const { client } = yield* Result.await(getClientContext(db, organizationId, namespace, repoName));
    yield* Result.await(client.createPullRequestThread(namespace, repoName, prNumber, body));
    return Result.ok(undefined);
  });
}

export { normalizeAdoWorkflowTriggerInput };
