import { useEffect, useRef, useState } from "react";
import {
  REPO_ENV_KEY_PATTERN,
  repoEnvKeyErrorMessage,
  validateRepoEnvKey,
} from "@openharness/shared/repo-environment";
import type { RepoEnvironmentVariable } from "../../../../preload/api";
import { SettingsButton } from "../settings/SettingsButton";
import { SettingsModal } from "../settings/SettingsModal";
import { SettingsToggle } from "../settings/SettingsToggle";

type RepoEnvironmentVariableEditorModalProps = {
  open: boolean;
  variable: RepoEnvironmentVariable | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    key: string;
    value: string;
    isSecret: boolean;
    description: string | null;
  }) => Promise<void>;
};

export function RepoEnvironmentVariableEditorModal({
  open,
  variable,
  saving,
  onClose,
  onSave,
}: RepoEnvironmentVariableEditorModalProps) {
  const keyInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isEdit = variable != null;

  useEffect(() => {
    if (!open) {
      setKey("");
      setValue("");
      setIsSecret(false);
      setDescription("");
      setError(null);
      return;
    }
    if (variable) {
      setKey(variable.key);
      setValue("");
      setIsSecret(variable.isSecret);
      setDescription(variable.description ?? "");
    }
    const frame = requestAnimationFrame(() => {
      if (variable) {
        valueInputRef.current?.focus();
      } else {
        keyInputRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, variable]);

  const keyPreview = key.trim();
  const keyValidation = keyPreview ? validateRepoEnvKey(keyPreview) : null;
  const keyError =
    keyPreview && keyValidation && !keyValidation.ok
      ? repoEnvKeyErrorMessage(keyValidation.error)
      : null;

  const handleSave = async () => {
    setError(null);
    const validation = validateRepoEnvKey(key);
    if (!validation.ok) {
      setError(repoEnvKeyErrorMessage(validation.error));
      return;
    }
    if (!value.trim()) {
      setError(
        isEdit && variable?.isSecret
          ? "Enter a new value to update this secret."
          : "Value is required.",
      );
      return;
    }
    try {
      await onSave({
        key: validation.normalized,
        value: value.trim(),
        isSecret,
        description: description.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save variable");
    }
  };

  return (
    <SettingsModal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${variable?.key}` : "Add variable"}
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
      footer={
        <>
          <SettingsButton variant="ghost" size="sm" disabled={saving} onClick={onClose}>
            Cancel
          </SettingsButton>
          <SettingsButton
            variant="save"
            size="sm"
            disabled={
              saving ||
              Boolean(keyError) ||
              (!isEdit && keyPreview.length > 0 && !REPO_ENV_KEY_PATTERN.test(keyPreview))
            }
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </SettingsButton>
        </>
      }
    >
      <div className="workflow-field">
        <label className="workflow-field-label" htmlFor="repo-env-key">
          Name
        </label>
        <input
          ref={keyInputRef}
          id="repo-env-key"
          className="settings-api-input"
          value={key}
          onChange={(event) => setKey(event.target.value.toUpperCase())}
          placeholder="STAGING_API_URL"
          disabled={isEdit || saving}
          spellCheck={false}
          autoComplete="off"
        />
        {keyError ? (
          <p className="settings-error workflow-modal-feedback" role="alert">
            {keyError}
          </p>
        ) : null}
        {!isEdit ? (
          <p className="settings-muted workflow-modal-feedback">
            Use UPPER_SNAKE_CASE. Reserved names and OPENHARNESS_* are blocked.
          </p>
        ) : null}
      </div>

      <div className="workflow-field">
        <label className="workflow-field-label" htmlFor="repo-env-value">
          Value
        </label>
        <input
          ref={valueInputRef}
          id="repo-env-value"
          className="settings-api-input"
          type={isSecret ? "password" : "text"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={isEdit && variable?.isSecret ? "Enter new secret value" : "Value"}
          disabled={saving}
          spellCheck={false}
          autoComplete="off"
        />
        {isEdit && variable?.isSecret && variable.maskedHint ? (
          <p className="settings-muted workflow-modal-feedback">
            Current secret: <span className="settings-key-hint">{variable.maskedHint}</span>
          </p>
        ) : null}
      </div>

      <div className="workflow-field">
        <div className="workflow-modal-toggle-row">
          <div className="workflow-modal-toggle-text">
            <span className="workflow-modal-toggle-label">Secret</span>
            <p className="settings-muted workflow-modal-toggle-hint">Masked after save</p>
          </div>
          <SettingsToggle
            label="Mark as secret"
            checked={isSecret}
            disabled={saving}
            onChange={setIsSecret}
          />
        </div>
      </div>

      <div className="workflow-field">
        <label className="workflow-field-label" htmlFor="repo-env-description">
          Description (optional)
        </label>
        <input
          id="repo-env-description"
          className="settings-api-input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this variable is used for"
          disabled={saving}
        />
      </div>

      {error ? (
        <p className="settings-error workflow-modal-feedback" role="alert">
          {error}
        </p>
      ) : null}
    </SettingsModal>
  );
}
