import { randomUUID } from "node:crypto";
import { and, eq, sql, type Database } from "@openharness/db";
import { linearAgentRun, linearAgentRunEvent } from "@openharness/db/schema";
import { Result } from "better-result";
import {
  BatchTooLargeError,
  RunNotActiveError,
  RunNotFoundError,
  type RunEventsError,
} from "../errors.js";

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
): Promise<Result<{ appended: number; lastSeq: number | null }, RunEventsError>> {
  if (events.length === 0) {
    return Result.ok({ appended: 0, lastSeq: null });
  }
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    return Result.err(new BatchTooLargeError({ message: "Too many events in one request" }));
  }

  const runRows = await db
    .select({ status: linearAgentRun.status })
    .from(linearAgentRun)
    .where(and(eq(linearAgentRun.id, runId), eq(linearAgentRun.organizationId, organizationId)))
    .limit(1);

  const run = runRows[0];
  if (!run) {
    return Result.err(new RunNotFoundError({ message: "Linear agent run not found" }));
  }
  if (run.status !== "claimed" && run.status !== "running") {
    return Result.err(
      new RunNotActiveError({ message: "Linear agent run is not accepting events" }),
    );
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

  return Result.ok({
    appended: rows.length,
    lastSeq: rows[rows.length - 1]?.seq ?? null,
  });
}
