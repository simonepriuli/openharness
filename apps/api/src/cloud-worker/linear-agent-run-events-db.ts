import { randomUUID } from "node:crypto";
import { and, eq, sql, type Database } from "@openharness/db";
import { linearAgentRun, linearAgentRunEvent } from "@openharness/db/schema";

const MAX_EVENTS_PER_REQUEST = 50;

export type LinearAgentRunEventRow = {
  seq: number;
  event: unknown;
  createdAt: string;
};

export async function appendLinearAgentRunEvents(
  db: Database,
  organizationId: string,
  runId: string,
  events: unknown[],
): Promise<{ appended: number; lastSeq: number | null }> {
  if (events.length === 0) {
    return { appended: 0, lastSeq: null };
  }
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    throw new LinearAgentRunEventsError("BATCH_TOO_LARGE", "Too many events in one request");
  }

  const runRows = await db
    .select({ status: linearAgentRun.status })
    .from(linearAgentRun)
    .where(and(eq(linearAgentRun.id, runId), eq(linearAgentRun.organizationId, organizationId)))
    .limit(1);

  const run = runRows[0];
  if (!run) {
    throw new LinearAgentRunEventsError("RUN_NOT_FOUND", "Linear agent run not found");
  }
  if (run.status !== "claimed" && run.status !== "running") {
    throw new LinearAgentRunEventsError("RUN_NOT_ACTIVE", "Linear agent run is not accepting events");
  }

  const maxSeqRows = await db
    .select({ maxSeq: sql<number>`coalesce(max(${linearAgentRunEvent.seq}), 0)` })
    .from(linearAgentRunEvent)
    .where(eq(linearAgentRunEvent.linearAgentRunId, runId));
  let nextSeq = (maxSeqRows[0]?.maxSeq ?? 0) + 1;

  const rows = events.map((event) => ({
    id: randomUUID(),
    linearAgentRunId: runId,
    organizationId,
    seq: nextSeq++,
    event,
  }));

  await db.insert(linearAgentRunEvent).values(rows);

  return {
    appended: rows.length,
    lastSeq: rows[rows.length - 1]?.seq ?? null,
  };
}

export class LinearAgentRunEventsError extends Error {
  constructor(
    readonly code: "BATCH_TOO_LARGE" | "RUN_NOT_FOUND" | "RUN_NOT_ACTIVE",
    message: string,
  ) {
    super(message);
    this.name = "LinearAgentRunEventsError";
  }
}
