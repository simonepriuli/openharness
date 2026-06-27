import {
  getAllWorkflowRuns,
  getWorkflowRunById,
  putWorkflowRun,
  type StoredWorkflowRun,
} from "./chat-db";
import { extractWorkflowFailure } from "./workflow-conversation";

export type { StoredWorkflowRun };

export async function getStoredWorkflowRun(runId: string): Promise<StoredWorkflowRun | null> {
  return getWorkflowRunById(runId);
}

export async function listStoredWorkflowRuns(): Promise<StoredWorkflowRun[]> {
  const rows = await getAllWorkflowRuns();
  return rows.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function persistWorkflowRun(input: {
  runId: string;
  workflowId?: string | null;
  title: string;
  messages: unknown[];
  streaming: boolean;
  touchUpdatedAt?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getWorkflowRunById(input.runId);
  const touchUpdatedAt = input.touchUpdatedAt !== false;
  const error = extractWorkflowFailure(input.messages);

  const row: StoredWorkflowRun = {
    runId: input.runId,
    workflowId: input.workflowId ?? existing?.workflowId ?? null,
    title: input.title,
    messages: input.messages,
    streaming: input.streaming,
    error,
    createdAt: existing?.createdAt ?? now,
    updatedAt: touchUpdatedAt ? now : (existing?.updatedAt ?? now),
  };

  await putWorkflowRun(row);
}
