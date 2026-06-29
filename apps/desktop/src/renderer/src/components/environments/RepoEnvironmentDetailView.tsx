import { Add01Icon, ArrowLeft01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RepoEnvironmentSummary, RepoEnvironmentVariable } from "../../../../preload/api";
import { formatRelativeCompact } from "../../lib/formatRelativeCompact";
import {
  formatRepoEnvironmentValue,
  useDeleteRepoEnvironmentVariableMutation,
  useRepoEnvironmentVariablesQuery,
  useUpsertRepoEnvironmentVariableMutation,
} from "../../queries/use-repo-environments";
import { SettingsButton } from "../settings/SettingsButton";
import { RepoEnvironmentVariableEditorModal } from "./RepoEnvironmentVariableEditorModal";

type RepoEnvironmentDetailViewProps = {
  repo: RepoEnvironmentSummary;
  onBack: () => void;
};

function VariableRowMenu({
  variable,
  disabled,
  onEdit,
  onRemove,
}: {
  variable: RepoEnvironmentVariable;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPanelEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setPanelEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`workflow-list-row-menu${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="workflow-list-row-menu-trigger"
        aria-label={`Actions for ${variable.key}`}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.6} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={`Actions for ${variable.key}`}
          className={`project-row-menu-shell workspace-panel-shell ${
            panelEntered ? "is-open" : "is-closed"
          } workflow-list-row-menu-panel`}
        >
          <div className="workspace-panel workflow-list-menu-inner">
            <div className="workspace-panel-menu">
              <button
                type="button"
                role="menuitem"
                className="workspace-panel-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onEdit();
                }}
              >
                <span className="workspace-panel-item-label">Edit</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="workspace-panel-item workspace-panel-item-danger"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onRemove();
                }}
              >
                <span className="workspace-panel-item-label">Delete</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RepoEnvironmentDetailView({ repo, onBack }: RepoEnvironmentDetailViewProps) {
  const variablesQuery = useRepoEnvironmentVariablesQuery(repo.connectionId);
  const upsertVariable = useUpsertRepoEnvironmentVariableMutation(repo.connectionId);
  const deleteVariable = useDeleteRepoEnvironmentVariableMutation(repo.connectionId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingVariable, setEditingVariable] = useState<RepoEnvironmentVariable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const variables = variablesQuery.data?.variables ?? [];
  const loading = variablesQuery.isPending && !variablesQuery.data;
  const loadError =
    variablesQuery.error instanceof Error ? variablesQuery.error.message : null;

  const openCreate = useCallback(() => {
    setEditingVariable(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((variable: RepoEnvironmentVariable) => {
    setEditingVariable(variable);
    setEditorOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (variable: RepoEnvironmentVariable) => {
      setError(null);
      try {
        await deleteVariable.mutateAsync({
          connectionId: repo.connectionId,
          key: variable.key,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete variable");
      }
    },
    [deleteVariable, repo.connectionId],
  );

  const handleSave = useCallback(
    async (input: {
      key: string;
      value: string;
      isSecret: boolean;
      description: string | null;
    }) => {
      setError(null);
      await upsertVariable.mutateAsync({
        connectionId: repo.connectionId,
        key: input.key,
        value: input.value,
        isSecret: input.isSecret,
        description: input.description,
      });
    },
    [repo.connectionId, upsertVariable],
  );

  return (
    <div className="environments-detail">
      <div className="environments-detail-header">
        <button type="button" className="environments-back-button" onClick={onBack}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.7} aria-hidden />
          Repositories
        </button>
        <div className="environments-detail-title-row">
          <h2 className="settings-section-title">{repo.fullName}</h2>
          <SettingsButton size="sm" className="shrink-0" onClick={openCreate}>
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} aria-hidden />
            Add
          </SettingsButton>
        </div>
      </div>

      {loading ? <p className="settings-muted">Loading variables…</p> : null}
      {loadError ? <p className="settings-error">{loadError}</p> : null}
      {error ? <p className="settings-error">{error}</p> : null}

      {!loading && !loadError ? (
        <>
          <div className="workflow-history-table-wrap">
            <table className="workflow-history-table org-secrets-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Type</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {variables.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="settings-muted">
                      No variables yet. Add one to configure Cloud Workers for this repo.
                    </td>
                  </tr>
                ) : (
                  variables.map((variable) => (
                    <tr key={variable.key}>
                      <td className="org-secrets-provider-name">{variable.key}</td>
                      <td className="org-secrets-key-display">
                        <span className="org-secrets-key-hint">
                          {formatRepoEnvironmentValue(variable)}
                        </span>
                      </td>
                      <td>{variable.isSecret ? "Secret" : "Plain"}</td>
                      <td className="org-secrets-updated">
                        {formatRelativeCompact(variable.updatedAt) ?? "—"}
                      </td>
                      <td className="workflow-list-actions">
                        <VariableRowMenu
                          variable={variable}
                          disabled={deleteVariable.isPending || upsertVariable.isPending}
                          onEdit={() => openEdit(variable)}
                          onRemove={() => void handleDelete(variable)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="settings-muted settings-section-lead environments-detail-subtitle">
            Variables injected into Cloud Workers for this repository. Model API keys live under
            Organization → Secrets.
          </p>
        </>
      ) : null}

      <RepoEnvironmentVariableEditorModal
        open={editorOpen}
        variable={editingVariable}
        saving={upsertVariable.isPending}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
