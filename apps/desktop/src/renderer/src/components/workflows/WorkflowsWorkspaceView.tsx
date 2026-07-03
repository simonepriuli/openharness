import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  HarnessSettings,
  WorkflowRecord,
  WorkflowRunSummary,
  WorkflowTools,
  WorkflowTrigger,
  WorkflowTriggerEvent,
} from "../../../../preload/api";
import { SettingsTabs } from "../settings/SettingsTabs";
import {
  getWorkflowsQueryError,
  useDeleteWorkflowMutation,
  useWorkflowsQuery,
} from "../../queries/use-workflows";
import { remoteKeys } from "../../queries/query-keys";
import { WorkflowEditorView } from "../settings/workflows/WorkflowEditorView";
import { WorkflowListView } from "../settings/workflows/WorkflowListView";
import { WorkflowRunnerSettingsView } from "../settings/WorkflowRunnerSettingsView";
import {
  buildWorkflowRunSummary,
  WorkflowRunSummaryDetail,
} from "./WorkflowRunDetailView";
import { WorkflowRunsFeedView } from "./WorkflowRunsFeedView";
import { useWorkflowRunRuntimes } from "./useWorkflowRunRuntimes";
import { createInitialTimelineState } from "../../events";

export type WorkflowsWorkspaceTab = "definitions" | "runs" | "settings";

type ViewMode = "list" | "create" | "detail";

const EMPTY_TOOLS: WorkflowTools = {
  prComment: false,
  prApprove: false,
  prPush: false,
  prCreate: false,
  teamsNotify: false,
};

function createBlankDraft(): Partial<WorkflowRecord> {
  return {
    name: "Untitled",
    enabled: false,
    localOnly: false,
    model: "",
    instructions: "",
    triggers: [],
    tools: { ...EMPTY_TOOLS },
    owner: "",
    repo: "",
    connectionId: "",
    fullName: "",
  };
}

function WorkflowsWorkspaceShell({
  children,
  panel = true,
  variant = "default",
}: {
  children: ReactNode;
  panel?: boolean;
  variant?: "default" | "run-detail";
}) {
  return (
    <div
      className={`settings-main app-region-no-drag min-h-0 w-full flex-1${variant === "run-detail" ? " settings-main-run-detail" : ""}`}
    >
      {panel ? (
        <div
          className={`settings-panel${variant === "run-detail" ? " settings-panel-run-detail" : ""}`}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function findRunSummaryInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  runId: string,
): WorkflowRunSummary | null {
  const queries = queryClient.getQueriesData<{ runs: WorkflowRunSummary[] }>({
    queryKey: [...remoteKeys.all, "workflowRuns"],
  });
  for (const [, data] of queries) {
    const match = data?.runs.find((run) => run.id === runId);
    if (match) return match;
  }
  return null;
}

type WorkflowsWorkspaceViewProps = {
  workspaceTab: WorkflowsWorkspaceTab;
  onWorkspaceTabChange: (tab: WorkflowsWorkspaceTab) => void;
  selectedRunId: string | null;
  onSelectedRunIdChange: (runId: string | null) => void;
  pendingManualRunId?: string | null;
  onPendingManualRunOpened?: () => void;
  onRunTriggered?: (runId: string) => void;
  activeSessionKey?: string | null;
};

export function WorkflowsWorkspaceView({
  workspaceTab,
  onWorkspaceTabChange,
  selectedRunId,
  onSelectedRunIdChange,
  pendingManualRunId,
  onPendingManualRunOpened,
  onRunTriggered,
  activeSessionKey = null,
}: WorkflowsWorkspaceViewProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("list");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<Partial<WorkflowRecord> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedRunSummary, setSelectedRunSummary] = useState<WorkflowRunSummary | null>(null);
  const [harnessSettings, setHarnessSettings] = useState<HarnessSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);

  const workflowsQuery = useWorkflowsQuery();
  const deleteWorkflow = useDeleteWorkflowMutation();

  const workflows = workflowsQuery.data?.workflows ?? [];
  const templates = workflowsQuery.data?.templates ?? [];
  const loading = workflowsQuery.isPending;
  const error = getWorkflowsQueryError(workflowsQuery) ?? deleteError;

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId],
  );

  const effectiveSelectedRunId = selectedRunId ?? pendingManualRunId ?? null;

  const { selectedRuntime } = useWorkflowRunRuntimes({
    selectedRunId: effectiveSelectedRunId,
    pendingManualRunId,
    onPendingManualRunOpened,
    runStatus: selectedRunSummary?.status,
    resolvedExecutor: selectedRunSummary?.resolvedExecutor,
  });

  const isStreaming = selectedRuntime?.isStreaming ?? false;
  const runtimeError = selectedRuntime?.error ?? null;

  useEffect(() => {
    if (workspaceTab !== "settings") return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await window.harness.getSettings();
        if (!cancelled) {
          setHarnessSettings(next);
          setSettingsLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSettingsLoadError(err instanceof Error ? err.message : "Failed to load settings");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceTab]);

  const saveWorkflowSummarizationModel = useCallback(async (workflowSummarizationModel: string) => {
    setSettingsSaving(true);
    try {
      const next = await window.harness.setSettings({ workflowSummarizationModel });
      setHarnessSettings(next);
    } finally {
      setSettingsSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!effectiveSelectedRunId || isStreaming) return;
    const cached = findRunSummaryInCache(queryClient, effectiveSelectedRunId);
    if (cached) {
      setSelectedRunSummary(cached);
    }
  }, [effectiveSelectedRunId, isStreaming, queryClient]);

  const displayRun = useMemo(() => {
    if (!effectiveSelectedRunId) return null;
    return buildWorkflowRunSummary({
      runId: effectiveSelectedRunId,
      summary: selectedRunSummary,
      workflowName: selectedRuntime?.title ?? selectedRunSummary?.workflowName,
      workflowId: selectedRuntime?.workflowId ?? selectedRunSummary?.workflowId,
      isStreaming,
      error: runtimeError,
    });
  }, [
    effectiveSelectedRunId,
    isStreaming,
    runtimeError,
    selectedRunSummary,
    selectedRuntime?.title,
    selectedRuntime?.workflowId,
  ]);

  const handleDeleteWorkflow = async (workflowId: string) => {
    const workflow = workflows.find((row) => row.id === workflowId);
    if (!workflow) return;
    if (!window.confirm(`Delete "${workflow.name}"?`)) return;
    setDeleteError(null);
    try {
      await deleteWorkflow.mutateAsync(workflowId);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete workflow");
    }
  };

  const clearSelectedRun = () => {
    onSelectedRunIdChange(null);
    setSelectedRunSummary(null);
  };

  if (effectiveSelectedRunId && workspaceTab === "runs" && displayRun) {
    return (
      <WorkflowsWorkspaceShell variant="run-detail">
        <WorkflowRunSummaryDetail
          run={displayRun}
          error={runtimeError}
          isStreaming={isStreaming}
          timeline={selectedRuntime?.timeline ?? createInitialTimelineState()}
          onBack={clearSelectedRun}
        />
      </WorkflowsWorkspaceShell>
    );
  }

  if (view === "create" && createDraft) {
    return (
      <WorkflowsWorkspaceShell panel={false}>
        <WorkflowEditorView
          mode="create"
          templates={templates}
          initial={createDraft}
          onBack={() => {
            setView("list");
            setCreateDraft(null);
          }}
          onSaved={(workflow) => {
            setSelectedWorkflowId(workflow.id);
            setCreateDraft(null);
            setView("detail");
          }}
          onRunTriggered={onRunTriggered}
        />
      </WorkflowsWorkspaceShell>
    );
  }

  if (view === "detail" && selectedWorkflow) {
    return (
      <WorkflowsWorkspaceShell panel={false}>
        <WorkflowEditorView
          mode="detail"
          templates={templates}
          workflow={selectedWorkflow}
          onBack={() => {
            setView("list");
            setSelectedWorkflowId(null);
          }}
          onDeleted={() => {
            setSelectedWorkflowId(null);
            setView("list");
          }}
          onRunTriggered={onRunTriggered}
        />
      </WorkflowsWorkspaceShell>
    );
  }

  return (
    <WorkflowsWorkspaceShell>
      <h2 className="settings-panel-title">Workflows</h2>
      <p className="settings-muted settings-section-lead">
        Automate repository tasks with shared workflows.
      </p>

      <SettingsTabs
        variant="pill"
        className="workflow-workspace-tabs mt-4 mb-6"
        value={workspaceTab}
        onChange={onWorkspaceTabChange}
        ariaLabel="Workflow sections"
        items={[
          { id: "definitions", label: "Overview" },
          { id: "runs", label: "Runs" },
          { id: "settings", label: "Settings" },
        ]}
      />

      {workspaceTab === "runs" ? (
        <WorkflowRunsFeedView
          selectedRunId={selectedRunId}
          onSelectRun={(run) => {
            onWorkspaceTabChange("runs");
            onSelectedRunIdChange(run.id);
            setSelectedRunSummary(run);
          }}
        />
      ) : workspaceTab === "settings" ? (
        settingsLoadError ? (
          <p className="settings-error">{settingsLoadError}</p>
        ) : harnessSettings ? (
          <WorkflowRunnerSettingsView
            embedded
            settings={harnessSettings}
            saving={settingsSaving}
            sessionKey={activeSessionKey}
            onSaveWorkflowSummarizationModel={saveWorkflowSummarizationModel}
          />
        ) : (
          <p className="settings-muted">Loading settings…</p>
        )
      ) : (
        <WorkflowListView
          workflows={workflows}
          loading={loading}
          error={error}
          onCreate={() => {
            setCreateDraft(createBlankDraft());
            setView("create");
          }}
          onOpen={(workflowId) => {
            setSelectedWorkflowId(workflowId);
            setView("detail");
          }}
          onDelete={(workflowId) => void handleDeleteWorkflow(workflowId)}
        />
      )}
    </WorkflowsWorkspaceShell>
  );
}

export type { WorkflowTrigger, WorkflowTriggerEvent };
