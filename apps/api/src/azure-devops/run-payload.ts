import { Result } from "better-result";
import type { AzureDevOpsApiError } from "../errors.js";
import type { NormalizedWebhookEvent } from "../source-control/types.js";
import type { AzureDevOpsClient } from "./client.js";

function refToBranch(ref: string | undefined): string {
  return (ref ?? "").replace(/^refs\/heads\//, "");
}

export function buildAdoRunPayloadSlice(
  pr: {
    title?: string;
    description?: string;
    sourceRefName?: string;
    targetRefName?: string;
    lastMergeSourceCommit?: { commitId?: string };
    lastMergeTargetCommit?: { commitId?: string };
    url?: string;
  },
  prNumber: number,
  rawPayload: Record<string, unknown>,
): Record<string, unknown> {
  const resource = rawPayload.resource as {
    comment?: { id?: number; content?: string; author?: { id?: string; displayName?: string } };
    reviewer?: { id?: string; displayName?: string; vote?: number };
  } | undefined;

  const base: Record<string, unknown> = {
    pullRequest: {
      number: prNumber,
      title: pr.title ?? "",
      body: pr.description ?? null,
      htmlUrl: pr.url ?? "",
      headRef: refToBranch(pr.sourceRefName),
      headSha: pr.lastMergeSourceCommit?.commitId ?? "",
      baseRef: refToBranch(pr.targetRefName),
      baseSha: pr.lastMergeTargetCommit?.commitId ?? "",
    },
  };

  if (resource?.reviewer) {
    const vote = resource.reviewer.vote ?? 0;
    let state = "commented";
    if (vote === 10) state = "approved";
    if (vote === -10) state = "changes_requested";
    base.review = {
      id: resource.reviewer.id,
      state,
      body: null,
      authorId: resource.reviewer.id,
      authorName: resource.reviewer.displayName,
    };
  }

  if (resource?.comment) {
    base.comment = {
      id: resource.comment.id,
      body: resource.comment.content ?? "",
      authorId: resource.comment.author?.id,
      authorName: resource.comment.author?.displayName,
    };
  }

  return base;
}

export async function enrichAdoRunPayload(
  client: AzureDevOpsClient,
  event: NormalizedWebhookEvent,
): Promise<Result<Record<string, unknown>, AzureDevOpsApiError>> {
  const prResult = await client.getPullRequest(event.namespace, event.repoName, event.prNumber);
  if (Result.isError(prResult)) return prResult;

  const slice = buildAdoRunPayloadSlice(prResult.value, event.prNumber, event.payload);
  return Result.ok({
    ...event.payload,
    ...slice,
  });
}
