import type { WorkflowEventSink } from "../deps.js";

const DEFAULT_FLUSH_INTERVAL_MS = 1500;
const MAX_BATCH_SIZE = 50;

function isInactiveWorkflowRunPersistError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("not accepting events");
}

export type BufferingWorkflowEventSink = WorkflowEventSink & {
  flush: () => Promise<void>;
};

export function createBufferingWorkflowEventSink(options: {
  runId: string;
  flushIntervalMs?: number;
  onIpcEvent?: (event: unknown) => void;
  appendEvents: (events: unknown[]) => Promise<void>;
}): BufferingWorkflowEventSink {
  const messages: unknown[] = [];
  const buffer: unknown[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushChain = Promise.resolve();
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

  const flushBuffer = (): Promise<void> => {
    if (!options.runId || buffer.length === 0) return flushChain;

    const batch = buffer.splice(0, MAX_BATCH_SIZE);
    flushChain = flushChain.then(() =>
      options.appendEvents(batch).catch((err) => {
        if (isInactiveWorkflowRunPersistError(err)) return;
        console.error("[workflow-executor] failed to persist run events", err);
      }),
    );
    return flushChain;
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushBuffer();
    }, flushIntervalMs);
  };

  return {
    append(event) {
      messages.push(event);
      buffer.push(event);
      options.onIpcEvent?.(event);
      scheduleFlush();
    },
    snapshotMessages() {
      return [...messages];
    },
    setMessages(next) {
      messages.length = 0;
      messages.push(...next);
      void flushBuffer();
    },
    async flush() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      while (buffer.length > 0) {
        const batch = buffer.splice(0, MAX_BATCH_SIZE);
        try {
          await options.appendEvents(batch);
        } catch (err) {
          if (isInactiveWorkflowRunPersistError(err)) continue;
          console.error("[workflow-executor] failed to persist run events", err);
        }
      }
      await flushChain;
    },
  };
}
