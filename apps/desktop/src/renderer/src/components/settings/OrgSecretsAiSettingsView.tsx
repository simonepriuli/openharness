import { Add01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrgSecretSlotStatus } from "../../../../preload/api";
import {
  ORG_SECRET_SLOT_DISPLAY_NAMES,
  ORG_SECRET_SLOT_EXA,
  ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT,
  isCuratedCloudProviderSlot,
  type OrgSecretSlot,
} from "@openharness/shared/org-secret-slots";
import { formatRelativeCompact } from "../../lib/formatRelativeCompact";
import {
  useDeleteOrgSecretMutation,
  useOrgSecretsQuery,
  useUpsertOrgSecretMutation,
} from "../../queries/use-org-secrets";
import { OrgSecretEditorModal } from "./OrgSecretEditorModal";
import { SettingsButton } from "./SettingsButton";

function isWebSearchSecretSlot(slotId: string): boolean {
  return slotId === ORG_SECRET_SLOT_EXA;
}

function isOtherSecretSlot(slotId: string): boolean {
  return slotId === ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT;
}

function categorizeSecretSlots(slots: OrgSecretSlotStatus[]) {
  return {
    providers: slots.filter((slot) => isCuratedCloudProviderSlot(slot.slot)),
    webSearch: slots.filter((slot) => isWebSearchSecretSlot(slot.slot)),
    others: slots.filter((slot) => isOtherSecretSlot(slot.slot)),
  };
}

function slotDescription(slot: OrgSecretSlotStatus): string {
  if (slot.slot === ORG_SECRET_SLOT_EXA) {
    return "Web search for workflows and chat";
  }
  if (slot.slot === ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT) {
    return "OpenRouter account credits in the workspace panel";
  }
  return "Cloud model API key for all members";
}

function OrgSecretRowMenu({
  slot,
  disabled,
  onEdit,
  onRemove,
}: {
  slot: OrgSecretSlotStatus;
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
        aria-label={`Actions for ${slot.displayName}`}
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
          aria-label={`Actions for ${slot.displayName}`}
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
                <span className="workspace-panel-item-label">Edit key</span>
              </button>
              <div className="workflow-list-row-menu-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="workspace-panel-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onRemove();
                }}
              >
                <span className="workspace-panel-item-label">Remove</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrgSecretTableRow({
  slot,
  saving,
  onEdit,
  onRemove,
}: {
  slot: OrgSecretSlotStatus;
  saving: boolean;
  onEdit: (slot: OrgSecretSlotStatus) => void;
  onRemove: (slotId: string) => Promise<void>;
}) {
  const handleRemove = async () => {
    const confirmed = window.confirm(
      `Remove the ${slot.displayName} key for your organization? Members will need their own keys again.`,
    );
    if (!confirmed) return;
    await onRemove(slot.slot);
  };

  return (
    <tr className="org-secrets-row">
      <td className="org-secrets-provider">
        <div className="org-secrets-provider-name">{slot.displayName}</div>
        <div className="org-secrets-provider-desc">{slotDescription(slot)}</div>
      </td>
      <td className="org-secrets-key-display">
        {slot.maskedHint ? (
          <span className="org-secrets-key-hint">{slot.maskedHint}</span>
        ) : (
          <span className="settings-muted">—</span>
        )}
      </td>
      <td className="org-secrets-updated">
        {slot.updatedAt ? formatRelativeCompact(slot.updatedAt) : "—"}
      </td>
      <td className="workflow-list-actions">
        <OrgSecretRowMenu
          slot={slot}
          disabled={saving}
          onEdit={() => onEdit(slot)}
          onRemove={() => void handleRemove()}
        />
      </td>
    </tr>
  );
}

function OrgSecretsCategoryTable({
  title,
  slots,
  saving,
  onEdit,
  onRemove,
}: {
  title: string;
  slots: OrgSecretSlotStatus[];
  saving: boolean;
  onEdit: (slot: OrgSecretSlotStatus) => void;
  onRemove: (slotId: string) => Promise<void>;
}) {
  if (slots.length === 0) return null;

  return (
    <section className="org-secrets-category settings-section">
      <h3 className="settings-section-title">{title}</h3>
      <div className="workflow-list-table-wrap">
        <table className="workflow-list-table org-secrets-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Updated</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <OrgSecretTableRow
                key={slot.slot}
                slot={slot}
                saving={saving}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrgSecretSlotPicker({
  open,
  options,
  onSelect,
}: {
  open: boolean;
  options: OrgSecretSlotStatus[];
  onSelect: (slotId: OrgSecretSlot) => void;
}) {
  if (!open) return null;

  const { providers, webSearch, others } = categorizeSecretSlots(options);

  const renderOption = (slot: OrgSecretSlotStatus) => (
    <button
      key={slot.slot}
      type="button"
      className="settings-model-option"
      onClick={() => onSelect(slot.slot as OrgSecretSlot)}
    >
      {slot.displayName}
    </button>
  );

  const renderGroup = (label: string, groupSlots: OrgSecretSlotStatus[]) => {
    if (groupSlots.length === 0) return null;
    return (
      <>
        <div className="settings-model-group-label">{label}</div>
        {groupSlots.map(renderOption)}
      </>
    );
  };

  return (
    <div className="settings-model-panel" role="dialog" aria-label="Add secret">
      <div className="settings-model-list" role="listbox" aria-label="Available secrets">
        {renderGroup("Providers", providers)}
        {renderGroup("Web Search", webSearch)}
        {renderGroup("Others", others)}
        {options.length === 0 ? (
          <div className="settings-model-empty">All secrets are already added.</div>
        ) : null}
      </div>
    </div>
  );
}

function resolveSlotStatus(
  allSlots: OrgSecretSlotStatus[],
  slotId: OrgSecretSlot,
): OrgSecretSlotStatus {
  const existing = allSlots.find((slot) => slot.slot === slotId);
  return (
    existing ?? {
      slot: slotId,
      displayName: ORG_SECRET_SLOT_DISPLAY_NAMES[slotId],
      configured: false,
    }
  );
}

export function OrgSecretsAiSettingsView({ embedded = false }: { embedded?: boolean }) {
  const secretsQuery = useOrgSecretsQuery();
  const upsertSecret = useUpsertOrgSecretMutation();
  const deleteSecret = useDeleteOrgSecretMutation();
  const saving = upsertSecret.isPending || deleteSecret.isPending;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorSlot, setEditorSlot] = useState<OrgSecretSlotStatus | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = pickerRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setPickerOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const reload = useCallback(async () => {
    await secretsQuery.refetch();
  }, [secretsQuery]);

  const allSlots = secretsQuery.data?.slots ?? [];

  const configuredSlots = useMemo(
    () => allSlots.filter((slot) => slot.configured),
    [allSlots],
  );

  const { providers: providerSlots, webSearch: webSearchSlots, others: otherSecretSlots } =
    useMemo(() => categorizeSecretSlots(configuredSlots), [configuredSlots]);

  const availableSlots = useMemo(() => {
    const configuredIds = new Set(configuredSlots.map((slot) => slot.slot));
    return allSlots.filter((slot) => !configuredIds.has(slot.slot));
  }, [allSlots, configuredSlots]);

  const handleSave = async (slot: string, value: string) => {
    await upsertSecret.mutateAsync({ slot, value });
    await reload();
  };

  const handleRemove = async (slot: string) => {
    await deleteSecret.mutateAsync({ slot });
    await reload();
  };

  const handleAddSlot = (slotId: OrgSecretSlot) => {
    setPickerOpen(false);
    setEditorSlot(resolveSlotStatus(allSlots, slotId));
  };

  const handleEdit = (slot: OrgSecretSlotStatus) => {
    setEditorSlot(slot);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorSlot(null);
  };

  const loadError =
    secretsQuery.error instanceof Error ? secretsQuery.error.message : null;
  const canAddMore = availableSlots.length > 0;

  return (
    <div className={embedded ? undefined : "settings-panel"}>
      {!embedded ? (
        <>
          <h2 className="settings-panel-title">Secrets</h2>
          <p className="settings-muted settings-section-lead">
            Organization-wide API keys used by all members for chat and workflows.
          </p>
        </>
      ) : null}

      {secretsQuery.isPending && !secretsQuery.data ? (
        <p className={`settings-muted${embedded ? "" : " mt-4"}`}>Loading organization secrets…</p>
      ) : loadError ? (
        <p className={`settings-error${embedded ? "" : " mt-4"}`}>{loadError}</p>
      ) : (
        <div
          className={`org-secrets-section${
            embedded ? " org-secrets-section-embedded" : " org-secrets-section-standalone"
          }`}
        >
          <div className="workflow-detail-section-header">
            <h3 className="workflow-detail-label">Secrets</h3>
            {canAddMore ? (
              <div
                ref={pickerRef}
                className="settings-model-dropdown settings-model-dropdown-add workflow-trigger-add-wrap"
              >
                <SettingsButton
                  size="sm"
                  className="shrink-0"
                  aria-expanded={pickerOpen}
                  aria-haspopup="listbox"
                  disabled={saving}
                  onClick={() => setPickerOpen((open) => !open)}
                >
                  <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} aria-hidden />
                  Add secret
                </SettingsButton>
                <OrgSecretSlotPicker
                  open={pickerOpen}
                  options={availableSlots}
                  onSelect={handleAddSlot}
                />
              </div>
            ) : null}
          </div>

          {configuredSlots.length === 0 ? (
            <div className="workflow-list-table-wrap">
              <p className="workflow-list-empty settings-muted org-secrets-empty">
                No organization secrets configured yet. Use <strong>Add secret</strong> to share API
                keys with all members.
              </p>
            </div>
          ) : (
            <>
              <OrgSecretsCategoryTable
                title="Providers"
                slots={providerSlots}
                saving={saving}
                onEdit={handleEdit}
                onRemove={handleRemove}
              />
              <OrgSecretsCategoryTable
                title="Web Search"
                slots={webSearchSlots}
                saving={saving}
                onEdit={handleEdit}
                onRemove={handleRemove}
              />
              <OrgSecretsCategoryTable
                title="Others"
                slots={otherSecretSlots}
                saving={saving}
                onEdit={handleEdit}
                onRemove={handleRemove}
              />
            </>
          )}
        </div>
      )}

      <OrgSecretEditorModal
        open={editorSlot !== null}
        slot={editorSlot}
        saving={saving}
        onClose={closeEditor}
        onSave={handleSave}
      />
    </div>
  );
}
