import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowRunUpdatePayload } from "../../../../preload/api";
import {
  applyHarnessEvent,
  createInitialTimelineState,
  type TimelineState,
} from "../../events";
import { messagesToTimeline } from "../../lib/messages-to-timeline";
import { extractWorkflowFailure } from "../../lib/workflow-conversation";
import {
  getStoredWorkflowRun,
  persistWorkflowRun,
} from "../../lib/workflow-run-storage";
import { parseWorkflowRunSessionKey } from "../../lib/workflow-run-session";

export type WorkflowRunRuntime = {
  runId: string;
  workflowId: string | null;
  title: string;
  timeline: TimelineState;
  isStreaming: boolean;
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
    isStreaming: input.streaming ?? false,
    error: extractWorkflowFailure(messages),
  };
}

export function useWorkflowRunRuntimes(options?: {
  selectedRunId?: string | null;
  pendingManualRunId?: string | null;
  onPendingManualRunOpened?: () => void;
}) {
  const runtimesRef = useRef(new Map<string, WorkflowRunRuntime>());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const applyRunUpdate = useCallback(
    (payload: WorkflowRunUpdatePayload) => {
      const existing = runtimesRef.current.get(payload.runId);
      const runtime =
        existing ??
        createRunRuntime({
          runId: payload.runId,
          workflowId: payload.workflowId,
          title: payload.title,
        });

      runtime.title = payload.title;
      runtime.workflowId = payload.workflowId;
      runtime.isStreaming = payload.streaming;
      if (payload.streaming) {
        runtime.error = null;
      }
      if (payload.messages.length > 0) {
        runtime.timeline = messagesToTimeline(payload.messages);
      }
      runtime.error = extractWorkflowFailure(payload.messages);
      runtimesRef.current.set(payload.runId, runtime);
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
      const runtime = runtimesRef.current.get(runId);
      if (!runtime) return;
      runtime.timeline = applyHarnessEvent(runtime.timeline, event);
      const eventType = (event as { type?: string }).type;
      if (eventType === "agent_start") runtime.isStreaming = true;
      if (eventType === "agent_end") runtime.isStreaming = false;
      bump();
    });

    void window.harness.syncWorkflowRuns();

    return () => {
      unsubscribeUpdate();
      unsubscribeEvents();
    };
  }, [applyRunUpdate, bump]);

  useEffect(() => {
    const runId = options?.selectedRunId;
    if (!runId) return;
    if (runtimesRef.current.has(runId)) return;

    let cancelled = false;
    void getStoredWorkflowRun(runId).then((stored) => {
      if (cancelled) return;
      if (stored) {
        runtimesRef.current.set(
          runId,
          createRunRuntime({
            runId: stored.runId,
            workflowId: stored.workflowId,
            title: stored.title,
            messages: stored.messages,
            streaming: stored.streaming,
          }),
        );
        if (stored.error) {
          const runtime = runtimesRef.current.get(runId);
          if (runtime) runtime.error = stored.error;
        }
      } else {
        runtimesRef.current.set(
          runId,
          createRunRuntime({ runId, title: "Workflow run" }),
        );
      }
      bump();
    });

    return () => {
      cancelled = true;
    };
  }, [options?.selectedRunId, bump]);

  useEffect(() => {
    const pendingRunId = options?.pendingManualRunId;
    if (!pendingRunId) return;
    options?.onPendingManualRunOpened?.();
  }, [options?.pendingManualRunId, options?.onPendingManualRunOpened]);

  const selectedRuntime = useMemo(() => {
    void version;
    const runId = options?.selectedRunId;
    if (!runId) return null;
    return runtimesRef.current.get(runId) ?? null;
  }, [options?.selectedRunId, version]);

  return {
    selectedRuntime,
    applyRunUpdate,
    bump,
  };
}
