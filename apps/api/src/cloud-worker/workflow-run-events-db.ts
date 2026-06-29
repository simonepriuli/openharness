import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, sql, type Database } from "@openharness/db";
import { workflowRun, workflowRunEvent } from "@openharness/db/schema";

const MAX_EVENTS_PER_REQUEST = 50;

export type WorkflowRunEventRow = {
  seq: number;
  event: unknown;
  createdAt: string;
};

export async function appendWorkflowRunEvents(
  db: Database,
  organizationId: string,
  runId: string,
  events: unknown[],
): Promise<{ appended: number; lastSeq: number | null }> {
  if (events.length === 0) {
    return { appended: 0, lastSeq: null };
  }
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    throw new WorkflowRunEventsError("BATCH_TOO_LARGE", "Too many events in one request");
  }

  const runRows = await db
    .select({ status: workflowRun.status })
    .from(workflowRun)
    .where(and(eq(workflowRun.id, runId), eq(workflowRun.organizationId, organizationId)))
    .limit(1);

  const run = runRows[0];
  if (!run) {
    throw new WorkflowRunEventsError("RUN_NOT_FOUND", "Workflow run not found");
  }
  if (run.status !== "claimed" && run.status !== "running") {
    throw new WorkflowRunEventsError("RUN_NOT_ACTIVE", "Workflow run is not accepting events");
  }

  const maxSeqRows = await db
    .select({ maxSeq: sql<number>`coalesce(max(${workflowRunEvent.seq}), 0)` })
    .from(workflowRunEvent)
    .where(eq(workflowRunEvent.workflowRunId, runId));
  let nextSeq = (maxSeqRows[0]?.maxSeq ?? 0) + 1;

  const rows = events.map((event) => ({
    id: randomUUID(),
    workflowRunId: runId,
    organizationId,
    seq: nextSeq++,
    event,
  }));

  await db.insert(workflowRunEvent).values(rows);

  return {
    appended: rows.length,
    lastSeq: rows[rows.length - 1]?.seq ?? null,
  };
}

export async function listWorkflowRunEvents(
  db: Database,
  organizationId: string,
  runId: string,
  options?: { afterSeq?: number; limit?: number },
): Promise<{ events: WorkflowRunEventRow[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
  const conditions = [
    eq(workflowRunEvent.workflowRunId, runId),
    eq(workflowRunEvent.organizationId, organizationId),
  ];
  if (options?.afterSeq !== undefined) {
    conditions.push(gt(workflowRunEvent.seq, options.afterSeq));
  }

  const rows = await db
    .select({
      seq: workflowRunEvent.seq,
      event: workflowRunEvent.event,
      createdAt: workflowRunEvent.createdAt,
    })
    .from(workflowRunEvent)
    .where(and(...conditions))
    .orderBy(asc(workflowRunEvent.seq))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    events: page.map((row) => ({
      seq: row.seq,
      event: row.event,
      createdAt: row.createdAt.toISOString(),
    })),
    hasMore,
  };
}

export class WorkflowRunEventsError extends Error {
  constructor(
    readonly code: "BATCH_TOO_LARGE" | "RUN_NOT_FOUND" | "RUN_NOT_ACTIVE",
    message: string,
  ) {
    super(message);
    this.name = "WorkflowRunEventsError";
  }
}
