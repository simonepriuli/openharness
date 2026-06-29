import { useEffect, useMemo, useRef, useState } from "react";
import type { HarnessModelInfo, HarnessSettings } from "../../../../preload/api";
import { CHAT_MODEL_SELECTOR_MAX } from "../../lib/model-display";
import {
  formatModelRefLabel,
  modelRefFromParts,
  resolveDisplayModelOption,
} from "../../lib/model-ref-display";
import { SettingsCard } from "./SettingsCard";
import { SettingsModelOptionContent } from "./SettingsModelOptionContent";
import { SettingsModelPicker } from "./SettingsModelPicker";

type ChatSettingsProps = {
  settings: HarnessSettings;
  saving: boolean;
  sessionKey: string | null;
  onSaveChatVisibleModels: (modelRefs: string[]) => Promise<void>;
  onSaveTitleGenerationModel: (modelRef: string) => Promise<void>;
};

export function ChatSettings({
  settings,
  saving,
  sessionKey,
  onSaveChatVisibleModels,
  onSaveTitleGenerationModel,
}: ChatSettingsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [titleModel, setTitleModel] = useState(settings.titleGenerationModel);
  const [options, setOptions] = useState<HarnessModelInfo[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleModelError, setTitleModelError] = useState<string | null>(null);
  const [titleModelSaved, setTitleModelSaved] = useState<string | null>(null);

  const selectedModels = settings.chatVisibleModels;

  useEffect(() => {
    setTitleModel(settings.titleGenerationModel);
  }, [settings.titleGenerationModel]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
      setSearch("");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    void window.harness
      .getAvailableModels({ sessionKey })
      .then((models) => {
        if (cancelled) return;
        if (!Array.isArray(models)) {
          setOptions([]);
          return;
        }
        const safeModels = models.filter(
          (model): model is HarnessModelInfo =>
            Boolean(
              model &&
                typeof model === "object" &&
                typeof model.provider === "string" &&
                model.provider.trim().length > 0 &&
                typeof model.id === "string" &&
                model.id.trim().length > 0,
            ),
        );
        setOptions(safeModels);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  const fallbackOptions = useMemo(() => [] as string[], []);

  const noModelsConfigured = !loadingOptions && options.length === 0;

  const modelInfoByRef = useMemo(() => {
    const map = new Map<string, HarnessModelInfo>();
    for (const model of options) {
      map.set(modelRefFromParts(model.provider, model.id), model);
    }
    return map;
  }, [options]);

  const selectedSet = useMemo(() => new Set(selectedModels), [selectedModels]);

  const selectOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const model of options) {
      unique.add(modelRefFromParts(model.provider, model.id));
    }
    if (unique.size === 0) {
      for (const fallback of fallbackOptions) unique.add(fallback);
    }
    for (const modelRef of selectedModels) unique.add(modelRef);
    return [...unique].filter((value) => !selectedSet.has(value));
  }, [options, fallbackOptions, selectedModels, selectedSet]);

  const displayOptions = useMemo(
    () =>
      selectOptions.map((value) => resolveDisplayModelOption(value, modelInfoByRef)),
    [selectOptions, modelInfoByRef],
  );

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return displayOptions.slice(0, 100);
    return displayOptions
      .filter((item) => item.searchText.includes(query))
      .slice(0, 100);
  }, [search, displayOptions]);

  const canAddMore = selectedModels.length < CHAT_MODEL_SELECTOR_MAX;

  const saveModels = async (next: string[]) => {
    setError(null);
    try {
      await onSaveChatVisibleModels(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save chat settings");
    }
  };

  const addModel = async (modelRef: string) => {
    const nextRef = modelRef.trim();
    if (!nextRef || selectedSet.has(nextRef) || !canAddMore) return;
    await saveModels([...selectedModels, nextRef]);
    setOpen(false);
    setSearch("");
  };

  const removeModel = async (modelRef: string) => {
    await saveModels(selectedModels.filter((ref) => ref !== modelRef));
  };

  const saveTitleModel = async (modelRef: string) => {
    setTitleModelError(null);
    setTitleModelSaved(null);
    try {
      await onSaveTitleGenerationModel(modelRef.trim());
      setTitleModelSaved("Title generation model saved.");
    } catch (err) {
      setTitleModelError(err instanceof Error ? err.message : "Failed to save title model");
    }
  };

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Chat</h2>

      <SettingsCard title="Model selector" padded={false} overflowVisible>
      <div className="settings-row settings-model-selector-header">
        <div className="settings-row-text">
          <p className="settings-row-description">
            Choose up to {CHAT_MODEL_SELECTOR_MAX} models for chat. Leave empty to use curated defaults.
          </p>
          {selectedModels.length === 0 ? (
            <p className="settings-muted settings-row-feedback">Using default curated models.</p>
          ) : null}
          {loadingOptions ? (
            <p className="settings-muted settings-row-feedback">
              Loading available models from current session…
            </p>
          ) : null}
          {noModelsConfigured ? (
            <p className="settings-muted settings-row-feedback">
              No models available yet. Ask your organization admin to configure cloud providers under
              Organization → Secrets, or set up OAuth or local providers in Settings.
            </p>
          ) : null}
          {error ? <p className="settings-error settings-row-feedback">{error}</p> : null}
        </div>

        {canAddMore ? (
          <div ref={rootRef} className="settings-model-dropdown settings-model-dropdown-add">
            <button
              type="button"
              className="settings-model-trigger"
              aria-expanded={open}
              aria-haspopup="listbox"
              disabled={saving}
              onClick={() => setOpen((value) => !value)}
            >
              <span className="settings-model-trigger-label">Add model</span>
              <span className="settings-model-trigger-chevron" aria-hidden>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5 6 7.5 9 4.5"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>

            {open && (
              <div className="settings-model-panel" role="dialog" aria-label="Add chat model">
                <input
                  ref={searchRef}
                  type="search"
                  className="settings-model-search"
                  value={search}
                  placeholder="Search model (provider/model)"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={saving}
                  onChange={(e) => setSearch(e.target.value)}
                />

                <div className="settings-model-list" role="listbox" aria-label="Available models">
                  {filteredOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      role="option"
                      className="settings-model-option"
                      disabled={saving}
                      onClick={() => void addModel(item.value)}
                    >
                      <SettingsModelOptionContent option={item} />
                      {item.isFree ? (
                        <span className="settings-model-option-badge">FREE</span>
                      ) : null}
                    </button>
                  ))}
                  {filteredOptions.length === 0 ? (
                    <div className="settings-model-empty">No matching models</div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="settings-muted">
            Maximum of {CHAT_MODEL_SELECTOR_MAX} models selected.
          </p>
        )}
      </div>

      {selectedModels.length > 0 ? (
        <div className="settings-row settings-row-stack settings-model-selector-list">
          <ul className="settings-selected-models" aria-label="Selected chat models">
            {selectedModels.map((modelRef) => {
              const option = resolveDisplayModelOption(modelRef, modelInfoByRef);
              const name = formatModelRefLabel(option);
              return (
                <li key={modelRef} className="settings-selected-model">
                  <span className="settings-selected-model-name">{name}</span>
                  <button
                    type="button"
                    className="settings-selected-model-remove"
                    aria-label={`Remove ${name}`}
                    disabled={saving}
                    onClick={() => void removeModel(modelRef)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      </SettingsCard>

      <SettingsCard title="Title generation model" padded={false} overflowVisible>
      <div className="settings-row">
        <div className="settings-row-text">
          <p className="settings-row-description">
            Model used to generate titles from the first user message.
          </p>
          {loadingOptions ? (
            <p className="settings-muted settings-row-feedback">
              Loading available models from current session…
            </p>
          ) : null}
          {noModelsConfigured ? (
            <p className="settings-muted settings-row-feedback">
              No models available yet. Ask your organization admin to configure cloud providers under
              Organization → Secrets, or set up OAuth or local providers in Settings.
            </p>
          ) : null}
          {titleModelError ? (
            <p className="settings-error settings-row-feedback">{titleModelError}</p>
          ) : null}
          {titleModelSaved ? (
            <p className="settings-status settings-row-feedback">{titleModelSaved}</p>
          ) : null}
        </div>

        <SettingsModelPicker
          value={titleModel}
          onChange={(modelRef) => {
            setTitleModel(modelRef);
            void saveTitleModel(modelRef);
          }}
          sessionKey={sessionKey}
          disabled={saving}
          emptyLabel="Default (openrouter/google/gemma-4-31b-it:free)"
          panelAriaLabel="Select title generation model"
          listAriaLabel="Title generation models"
        />

      </div>
      </SettingsCard>
    </div>
  );
}
