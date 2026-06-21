import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  WorkflowRecord,
  WorkflowTemplate,
  WorkflowTools,
  WorkflowTrigger,
  WorkflowTriggerEvent,
} from "../../../../preload/api";
import { WorkflowEditorView } from "./workflows/WorkflowEditorView";
import { WorkflowListView } from "./workflows/WorkflowListView";

type ViewMode = "list" | "create" | "detail";

const EMPTY_TOOLS: WorkflowTools = {
  prComment: false,
  prApprove: false,
  prPush: false,
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
    projectPath: "",
    fullName: "",
  };
}

export function WorkflowsSettingsView() {
  const [view, setView] = useState<ViewMode>("list");
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<Partial<WorkflowRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (options?: { signal?: AbortSignal }) => {
    setLoading(true);
    try {
      const result = await window.harness.listWorkflows();
      if (options?.signal?.aborted) return;
      setWorkflows(result.workflows);
      setTemplates(result.templates);
      setError(null);
    } catch (err) {
      if (options?.signal?.aborted) return;
      const message = err instanceof Error ? err.message : "Failed to load workflows";
      setError(message.includes("Not signed in") ? "Sign in to manage GitHub workflows." : message);
    } finally {
      if (!options?.signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload({ signal: controller.signal });
    return () => controller.abort();
  }, [reload]);

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
          setWorkflows((prev) => [workflow, ...prev.filter((row) => row.id !== workflow.id)]);
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
        onUpdated={(workflow) => {
          setWorkflows((prev) =>
            prev.map((row) => (row.id === workflow.id ? workflow : row)),
          );
        }}
        onDeleted={() => {
          setWorkflows((prev) => prev.filter((row) => row.id !== selectedWorkflow.id));
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
    try {
      await window.harness.deleteWorkflow({ workflowId });
      setWorkflows((prev) => prev.filter((row) => row.id !== workflowId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workflow");
    }
  };

  return (
    <div className="settings-panel">
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
