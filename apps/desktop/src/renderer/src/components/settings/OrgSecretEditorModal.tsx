import { useEffect, useRef, useState } from "react";
import type { OrgSecretSlotStatus } from "../../../../preload/api";
import {
  ORG_SECRET_SLOT_EXA,
  ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT,
} from "@openharness/shared/org-secret-slots";
import { SettingsButton } from "./SettingsButton";
import { SettingsModal } from "./SettingsModal";

const PROVIDER_KEY_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
  groq: "https://console.groq.com/keys",
  mistral: "https://console.mistral.ai/api-keys/",
  deepseek: "https://platform.deepseek.com/api_keys",
};

const EXA_API_KEYS_URL = "https://dashboard.exa.ai/api-keys";
const OPENROUTER_MANAGEMENT_KEYS_URL = "https://openrouter.ai/settings/management-keys";

function slotDescription(slot: OrgSecretSlotStatus): string {
  if (slot.slot === ORG_SECRET_SLOT_EXA) {
    return "Web search for workflows and chat. Shared with all organization members.";
  }
  if (slot.slot === ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT) {
    return "Shows OpenRouter account credits in the workspace panel. Not used for model inference.";
  }
  return "Cloud model provider API key shared with all organization members.";
}

function getKeyUrl(slot: OrgSecretSlotStatus): string | undefined {
  if (slot.slot === ORG_SECRET_SLOT_EXA) return EXA_API_KEYS_URL;
  if (slot.slot === ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT) return OPENROUTER_MANAGEMENT_KEYS_URL;
  return PROVIDER_KEY_URLS[slot.slot];
}

type OrgSecretEditorModalProps = {
  open: boolean;
  slot: OrgSecretSlotStatus | null;
  saving: boolean;
  onClose: () => void;
  onSave: (slotId: string, value: string) => Promise<void>;
};

export function OrgSecretEditorModal({
  open,
  slot,
  saving,
  onClose,
  onSave,
}: OrgSecretEditorModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setValue("");
      setError(null);
      return;
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, slot?.slot]);

  if (!slot) return null;

  const keyUrl = getKeyUrl(slot);
  const isEdit = slot.configured;

  const handleSave = async () => {
    setError(null);
    if (!value.trim()) {
      setError("Enter an API key before saving.");
      return;
    }
    try {
      await onSave(slot.slot, value.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save key");
    }
  };

  return (
    <SettingsModal
      open={open}
      onClose={onClose}
      title={isEdit ? `Update ${slot.displayName}` : `Add ${slot.displayName}`}
      subtitle={slotDescription(slot)}
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
      footer={
        <>
          <SettingsButton variant="ghost" size="sm" disabled={saving} onClick={onClose}>
            Cancel
          </SettingsButton>
          <SettingsButton variant="save" size="sm" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save"}
          </SettingsButton>
        </>
      }
    >
      <div className="workflow-field">
        <label className="workflow-field-label" htmlFor="org-secret-api-key">
          API key
        </label>
        <input
          ref={inputRef}
          id="org-secret-api-key"
          type="password"
          className="settings-api-input"
          placeholder={isEdit ? "Paste a new key to replace" : "Paste API key"}
          value={value}
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
        />
        {isEdit && slot.maskedHint ? (
          <p className="settings-muted workflow-modal-feedback">
            Current key: <span className="settings-key-hint">{slot.maskedHint}</span>
          </p>
        ) : null}
        {keyUrl ? (
          <p className="settings-muted workflow-modal-feedback">
            <a className="settings-link" href={keyUrl} target="_blank" rel="noreferrer">
              Get a key from {slot.displayName}
            </a>
          </p>
        ) : null}
        {error ? (
          <p className="settings-error workflow-modal-feedback" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </SettingsModal>
  );
}
