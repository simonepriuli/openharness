import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowRunUpdatePayload } from "../../../../preload/api";
import {
  applyHarnessEvent,
  createInitialTimelineState,
  finalizeTimeline,
  type TimelineState,
} from "../../events";
import { messagesToTimeline } from "../../lib/messages-to-timeline";
import { extractWorkflowFailure } from "../../lib/workflow-conversation";
import {
  getStoredWorkflowRun,
  persistWorkflowRun,
} from "../../lib/workflow-run-storage";
import { parseWorkflowRunSessionKey } from "../../lib/workflow-run-session";

const POLL_INTERVAL_ACTIVE_CLOUD_MS = 1000;
const POLL_INTERVAL_DEFAULT_MS = 2500;
const EVENTS_PAGE_SIZE = 200;

function isApiRunActive(status: string | null | undefined): boolean {
  return status === "running" || status === "claimed" || status === "pending";
}

function isApiRunTerminal(status: string | null | undefined): boolean {
  return status === "done" || status === "failed";
}

function resolveEffectiveStreaming(
  runtime: WorkflowRunRuntime,
  runStatus: string | null | undefined,
  resolvedExecutor: "cloud" | "local" | null | undefined,
): boolean {
  if (isApiRunTerminal(runStatus)) return false;
  if (runtime.localStreaming && resolvedExecutor !== "cloud") return true;
  return resolvedExecutor === "cloud" && isApiRunActive(runStatus);
}

async function fetchAllWorkflowRunEvents(runId: string): Promise<
  Array<{ seq: number; event: unknown; createdAt: string }>
> {
  const allEvents: Array<{ seq: number; event: unknown; createdAt: string }> = [];
  let afterSeq = 0;

  while (true) {
    const { events, hasMore } = await window.harness.listWorkflowRunEvents({
      runId,
      afterSeq,
      limit: EVENTS_PAGE_SIZE,
    });
    if (events.length === 0) break;
    allEvents.push(...events);
    afterSeq = events[events.length - 1]!.seq;
    if (!hasMore) break;
  }

  return allEvents;
}

function replayWorkflowRunEvents(events: Array<{ seq: number; event: unknown }>): TimelineState {
  let timeline = createInitialTimelineState();
  for (const row of events) {
    timeline = applyHarnessEvent(timeline, row.event);
  }
  return timeline;
}

export type WorkflowRunRuntime = {
  runId: string;
  workflowId: string | null;
  title: string;
  timeline: TimelineState;
  /** Local IPC / workflow-runner streaming flag (not cloud API status). */
  localStreaming: boolean;
  error: string | null;
};

function createRunRuntime(input: {
  runId: string;
  workflowId?: string | null;
  title: string;
  messages?: unknown[];
  streaming?: boolean;
}): WorkflowRunRuntime {
  const messages = input.messages ?? [];
  return {
    runId: input.runId,
    workflowId: input.workflowId ?? null,
    title: input.title,
    timeline: messages.length ? messagesToTimeline(messages) : createInitialTimelineState(),
    localStreaming: input.streaming ?? false,
    error: extractWorkflowFailure(messages),
  };
}

function ensureRuntime(
  runtimes: Map<string, WorkflowRunRuntime>,
  runId: string,
): WorkflowRunRuntime {
  const existing = runtimes.get(runId);
  if (existing) return existing;
  const runtime = createRunRuntime({ runId, title: "Workflow run" });
  runtimes.set(runId, runtime);
  return runtime;
}

export function useWorkflowRunRuntimes(options?: {
  selectedRunId?: string | null;
  pendingManualRunId?: string | null;
  onPendingManualRunOpened?: () => void;
  runStatus?: string | null;
  resolvedExecutor?: "cloud" | "local" | null;
}) {
  const runtimesRef = useRef(new Map<string, WorkflowRunRuntime>());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const runStatus = options?.runStatus ?? null;
  const resolvedExecutor = options?.resolvedExecutor ?? null;

  const applyRunUpdate = useCallback(
    (payload: WorkflowRunUpdatePayload) => {
      const runtime = ensureRuntime(runtimesRef.current, payload.runId);

      runtime.title = payload.title;
      runtime.workflowId = payload.workflowId;
      runtime.localStreaming = payload.streaming;
      if (payload.streaming) {
        runtime.error = null;
      } else if (runtime.timeline.items.length > 0) {
        runtime.timeline = finalizeTimeline(runtime.timeline);
      }
      if (payload.messages.length > 0 && runtime.timeline.items.length === 0) {
        runtime.timeline = messagesToTimeline(payload.messages);
      }
      runtime.error = extractWorkflowFailure(payload.messages);
      bump();

      void persistWorkflowRun({
        runId: payload.runId,
        workflowId: payload.workflowId,
        title: payload.title,
        messages: payload.messages,
        streaming: payload.streaming,
        touchUpdatedAt: !payload.streaming,
      });
    },
    [bump],
  );

  useEffect(() => {
    const unsubscribeUpdate = window.harness.onWorkflowRunUpdate((payload) => {
      applyRunUpdate(payload);
    });

    const unsubscribeEvents = window.harness.onEvent(({ sessionKey, event }) => {
      const runId = parseWorkflowRunSessionKey(sessionKey);
      if (!runId) return;
      const runtime = ensureRuntime(runtimesRef.current, runId);
      runtime.timeline = applyHarnessEvent(runtime.timeline, event);
      const eventType = (event as { type?: string }).type;
      if (eventType === "agent_start") runtime.localStreaming = true;
      if (eventType === "agent_end") runtime.localStreaming = false;
      bump();
    });

    void window.harness.syncWorkflowRuns();

    return () => {
      unsubscribeUpdate();
      unsubscribeEvents();
    };
  }, [applyRunUpdate, bump]);

  useEffect(() => {
    const pendingRunId = options?.pendingManualRunId;
    if (!pendingRunId) return;
    options?.onPendingManualRunOpened?.();
  }, [options?.pendingManualRunId, options?.onPendingManualRunOpened]);

  useEffect(() => {
    const runId = options?.selectedRunId;
    if (!runId) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const afterSeqRef = { current: 0 };
    const runIsTerminal = isApiRunTerminal(runStatus);

    const bootstrapFromStored = async (runtime: WorkflowRunRuntime) => {
      const stored = await getStoredWorkflowRun(runId);
      if (cancelled || !stored) return;
      runtime.title = stored.title;
      runtime.workflowId = stored.workflowId;
      runtime.localStreaming = runIsTerminal ? false : stored.streaming;
      if (stored.messages.length > 0 && runtime.timeline.items.length === 0) {
        runtime.timeline = messagesToTimeline(stored.messages);
        if (runIsTerminal) {
          runtime.timeline = finalizeTimeline(runtime.timeline);
        }
      }
      if (stored.error) runtime.error = stored.error;
      bump();
    };

    const bootstrapFromApiEvents = async (runtime: WorkflowRunRuntime) => {
      try {
        const events = await fetchAllWorkflowRunEvents(runId);
        if (cancelled) return;

        if (events.length > 0) {
          runtime.timeline = replayWorkflowRunEvents(events);
          afterSeqRef.current = events[events.length - 1]!.seq;
          if (runIsTerminal) {
            runtime.timeline = finalizeTimeline(runtime.timeline);
            runtime.localStreaming = false;
          }
          bump();
          return;
        }

        if (runtime.timeline.items.length === 0) {
          await bootstrapFromStored(runtime);
        }
      } catch {
        if (runtime.timeline.items.length === 0) {
          await bootstrapFromStored(runtime);
        }
      }
    };

    const bootstrap = async () => {
      const runtime = ensureRuntime(runtimesRef.current, runId);
      const isLocallyStreaming =
        runtime.localStreaming && resolvedExecutor !== "cloud" && !runIsTerminal;

      if (isLocallyStreaming) return;

      if (runIsTerminal) {
        runtime.localStreaming = false;
      }

      await bootstrapFromApiEvents(runtime);
    };

    const pollEvents = async () => {
      const runtime = runtimesRef.current.get(runId);
      if (!runtime) return;

      const isLocallyStreaming =
        runtime.localStreaming && resolvedExecutor !== "cloud";
      if (isLocallyStreaming) return;

      try {
        const { events } = await window.harness.listWorkflowRunEvents({
          runId,
          afterSeq: afterSeqRef.current,
          limit: EVENTS_PAGE_SIZE,
        });
        if (cancelled || events.length === 0) return;

        const current = runtimesRef.current.get(runId);
        if (!current) return;

        const stillLocallyStreaming =
          current.localStreaming && resolvedExecutor !== "cloud";
        if (stillLocallyStreaming) return;

        for (const row of events) {
          current.timeline = applyHarnessEvent(current.timeline, row.event);
          afterSeqRef.current = row.seq;
        }
        bump();
      } catch {
        // Remote event polling is best-effort for cloud/historical runs.
      }
    };

    const startPolling = () => {
      if (runIsTerminal) return;

      void pollEvents();

      const cloudActive =
        resolvedExecutor === "cloud" && isApiRunActive(runStatus);
      const pollInterval = cloudActive
        ? POLL_INTERVAL_ACTIVE_CLOUD_MS
        : POLL_INTERVAL_DEFAULT_MS;
      pollTimer = setInterval(() => void pollEvents(), pollInterval);
    };

    void bootstrap().then(() => {
      if (!cancelled) startPolling();
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [options?.selectedRunId, runStatus, resolvedExecutor, bump]);

  const selectedRuntime = useMemo(() => {
    void version;
    const runId = options?.selectedRunId;
    if (!runId) return null;
    const runtime = runtimesRef.current.get(runId);
    if (!runtime) return null;

    return {
      ...runtime,
      isStreaming: resolveEffectiveStreaming(runtime, runStatus, resolvedExecutor),
    };
  }, [options?.selectedRunId, runStatus, resolvedExecutor, version]);

  return {
    selectedRuntime,
    applyRunUpdate,
    bump,
  };
}
