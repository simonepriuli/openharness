import { useMemo, useState } from "react";
import type {
  WorkflowRecord,
  WorkflowTools,
  WorkflowTrigger,
  WorkflowTriggerEvent,
} from "../../../../preload/api";
import {
  getWorkflowsQueryError,
  useDeleteWorkflowMutation,
  useWorkflowsQuery,
} from "../../queries/use-workflows";
import { WorkflowEditorView } from "./workflows/WorkflowEditorView";
import { WorkflowListView } from "./workflows/WorkflowListView";

type ViewMode = "list" | "create" | "detail";

const EMPTY_TOOLS: WorkflowTools = {
  prComment: false,
  prApprove: false,
  prPush: false,
  teamsNotify: false,
};

function createBlankDraft(): Partial<WorkflowRecord> {
  return {
    name: "Untitled",
    enabled: false,
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

export function WorkflowsSettingsView({ embedded = false }: { embedded?: boolean }) {
  const [view, setView] = useState<ViewMode>("list");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<Partial<WorkflowRecord> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  if (view === "create" && createDraft) {
    return (
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
      />
    );
  }

  if (view === "detail" && selectedWorkflow) {
    return (
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
      />
    );
  }

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

  return (
    <div className={embedded ? undefined : "settings-panel"}>
      {!embedded ? (
        <>
          <h2 className="settings-panel-title">Workflows</h2>
          <p className="settings-muted settings-section-lead">
            Automate repository tasks with org-shared workflow definitions.
          </p>
        </>
      ) : null}
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
    </div>
  );
}

export type { WorkflowTrigger, WorkflowTriggerEvent };
