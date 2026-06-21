import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  WorkflowRecord,
  WorkflowTemplate,
  WorkflowTrigger,
  WorkflowTriggerEvent,
} from "../../../../../preload/api";
import { WorkflowEditorTabs, type WorkflowEditorTab } from "./WorkflowEditorTabs";
import { WorkflowHeader } from "./WorkflowHeader";
import { WorkflowInstructionsSection } from "./WorkflowInstructionsSection";
import { WorkflowRunHistoryView } from "./WorkflowRunHistoryView";
import { WorkflowTemplateMenu } from "./WorkflowTemplateMenu";
import { WorkflowToolsSection } from "./WorkflowToolsSection";
import { WorkflowTriggersSection } from "./WorkflowTriggersSection";

type EditorTab = WorkflowEditorTab;

function draftSnapshot(draft: Partial<WorkflowRecord>): string {
  return JSON.stringify({
    name: draft.name ?? "",
    enabled: draft.enabled ?? false,
    owner: draft.owner ?? "",
    repo: draft.repo ?? "",
    projectPath: draft.projectPath ?? "",
    model: draft.model ?? "",
    instructions: draft.instructions ?? "",
    triggers: draft.triggers ?? [],
    tools: draft.tools ?? {},
  });
}

type WorkflowEditorViewProps =
  | {
      mode: "create";
      templates: WorkflowTemplate[];
      initial: Partial<WorkflowRecord>;
      onBack: () => void;
      onSaved: (workflow: WorkflowRecord) => void;
    }
  | {
      mode: "detail";
      templates: WorkflowTemplate[];
      workflow: WorkflowRecord;
      onBack: () => void;
      onUpdated: (workflow: WorkflowRecord) => void;
      onDeleted: () => void;
    };

export function WorkflowEditorView(props: WorkflowEditorViewProps) {
  const isCreate = props.mode === "create";
  const [tab, setTab] = useState<EditorTab>("settings");
  const [draft, setDraft] = useState<Partial<WorkflowRecord>>(
    isCreate ? props.initial : props.workflow,
  );
  const [workflowId, setWorkflowId] = useState<string | null>(isCreate ? null : props.workflow.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRevision, setSavedRevision] = useState(0);
  const savedSnapshot = useRef(
    draftSnapshot(isCreate ? props.initial : props.workflow),
  );

  useEffect(() => {
    if (!isCreate) {
      setDraft(props.workflow);
      setWorkflowId(props.workflow.id);
      savedSnapshot.current = draftSnapshot(props.workflow);
      setSavedRevision((revision) => revision + 1);
    }
  }, [isCreate, props]);

  const canSave = Boolean(draft.projectPath && draft.owner && draft.repo);
  const hasChanges = useMemo(
    () => draftSnapshot(draft) !== savedSnapshot.current,
    [draft, savedRevision],
  );

  const persist = useCallback(
    async (nextDraft: Partial<WorkflowRecord>) => {
      if (!canSave) return null;
      setSaving(true);
      setError(null);
      try {
        if (isCreate && !workflowId) {
          const result = await window.harness.createWorkflow({
            projectPath: nextDraft.projectPath!,
            owner: nextDraft.owner!,
            repo: nextDraft.repo!,
            name: nextDraft.name,
            enabled: nextDraft.enabled,
            model: nextDraft.model,
            instructions: nextDraft.instructions,
            triggers: nextDraft.triggers,
            tools: nextDraft.tools,
          });
          setWorkflowId(result.workflow.id);
          setDraft(result.workflow);
          savedSnapshot.current = draftSnapshot(result.workflow);
          setSavedRevision((revision) => revision + 1);
          if (props.mode === "create") props.onSaved(result.workflow);
          return result.workflow;
        }

        if (!workflowId) return null;
        const result = await window.harness.updateWorkflow({
          workflowId,
          projectPath: nextDraft.projectPath,
          owner: nextDraft.owner,
          repo: nextDraft.repo,
          name: nextDraft.name,
          enabled: nextDraft.enabled,
          model: nextDraft.model,
          instructions: nextDraft.instructions,
          triggers: nextDraft.triggers,
          tools: nextDraft.tools,
        });
        setDraft(result.workflow);
        savedSnapshot.current = draftSnapshot(result.workflow);
        setSavedRevision((revision) => revision + 1);
        if (props.mode === "detail") props.onUpdated(result.workflow);
        return result.workflow;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save workflow");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [canSave, isCreate, props, workflowId],
  );

  const updateDraft = useCallback((patch: Partial<WorkflowRecord>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = async () => {
    if (!canSave) {
      setError("Select a repository and local folder before saving.");
      return;
    }
    await persist(draft);
  };

  const handleApplyTemplate = (template: WorkflowTemplate) => {
    updateDraft({
      name: template.name,
      instructions: template.instructions,
      model: template.model,
      triggers: template.triggers.map((trigger) => ({
        ...trigger,
        id: crypto.randomUUID(),
      })),
      tools: { ...template.tools },
    });
  };

  const handleDelete = async () => {
    if (!workflowId || props.mode !== "detail") return;
    if (!window.confirm("Delete this workflow?")) return;
    try {
      await window.harness.deleteWorkflow({ workflowId });
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete workflow");
    }
  };

  const title = draft.name ?? "Untitled";

  return (
    <div className="settings-panel workflow-detail">
      <button type="button" className="workflow-detail-back" onClick={props.onBack}>
        ← Workflows
      </button>

      <div className={`workflow-detail-intro${isCreate ? " workflow-detail-intro-create" : ""}`}>
        <WorkflowHeader
          name={title}
          enabled={draft.enabled ?? false}
          owner={draft.owner ?? ""}
          repo={draft.repo ?? ""}
          projectPath={draft.projectPath ?? ""}
          saving={saving}
          canSave={canSave && hasChanges}
          onSave={() => void handleSave()}
          onNameChange={(name) => updateDraft({ name })}
          onToggleEnabled={(enabled) => updateDraft({ enabled })}
          onRepoChange={(owner, repo) => updateDraft({ owner, repo, fullName: `${owner}/${repo}` })}
          onProjectPathChange={(projectPath) => updateDraft({ projectPath })}
        />

        {!isCreate ? <WorkflowEditorTabs value={tab} onChange={setTab} /> : null}
      </div>

      {error ? <p className="settings-error mt-3">{error}</p> : null}

      {!isCreate && tab === "history" && workflowId ? (
        <WorkflowRunHistoryView workflowId={workflowId} />
      ) : (
        <div className="workflow-detail-sections">
          <WorkflowTriggersSection
            triggers={draft.triggers ?? []}
            repoName={draft.repo || "repository"}
            onChange={(triggers) => updateDraft({ triggers })}
          />

          <WorkflowInstructionsSection
            instructions={draft.instructions ?? ""}
            model={draft.model ?? ""}
            onInstructionsChange={(instructions) => updateDraft({ instructions })}
            onModelChange={(model) => updateDraft({ model })}
          />

          <WorkflowToolsSection
            tools={draft.tools ?? { memories: true, prComment: false, prApprove: false, prPush: false }}
            onChange={(tools) => updateDraft({ tools })}
          />

          <WorkflowTemplateMenu templates={props.templates} onApply={handleApplyTemplate} />

          {!isCreate ? (
            <div className="workflow-detail-danger">
              <button
                type="button"
                className="settings-button settings-button-ghost workflow-detail-delete"
                onClick={() => void handleDelete()}
              >
                Delete workflow
              </button>
            </div>
          ) : null}

          {isCreate && !workflowId ? (
            <p className="settings-muted text-xs">
              Pick a repository and local folder, then click Save to create the workflow.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function createTrigger(event: WorkflowTriggerEvent): WorkflowTrigger {
  return {
    id: crypto.randomUUID(),
    kind: "git_pr",
    event,
    filters: { commentAuthor: "anyone", prAuthor: "anyone" },
  };
}
