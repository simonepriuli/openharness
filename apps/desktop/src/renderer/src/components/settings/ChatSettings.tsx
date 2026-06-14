import { useEffect, useMemo, useRef, useState } from "react";
import type { HarnessModelInfo, HarnessSettings } from "../../../../preload/api";
import { CHAT_MODEL_SELECTOR_MAX } from "../../lib/model-display";
import {
  modelRefFromParts,
  toDisplayModelOption,
} from "../../lib/model-ref-display";

type ChatSettingsProps = {
  settings: HarnessSettings;
  saving: boolean;
  sessionKey: string | null;
  onSaveChatVisibleModels: (modelRefs: string[]) => Promise<void>;
};

export function ChatSettings({
  settings,
  saving,
  sessionKey,
  onSaveChatVisibleModels,
}: ChatSettingsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<HarnessModelInfo[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModels = settings.chatVisibleModels;

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
    if (!sessionKey) {
      setOptions([]);
      setLoadingOptions(false);
      return;
    }
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

  const fallbackOptions = useMemo(
    () => [
      "openrouter/moonshotai/kimi-k2.6",
      "openrouter/moonshotai/kimi-k2.6:free",
      "openrouter/moonshotai/kimi-k2.5",
      "openrouter/openai/gpt-5.5",
      "openrouter/anthropic/claude-sonnet-4.6",
      "openrouter/anthropic/claude-opus-4.8",
      "openrouter/openai/codex-mini",
    ],
    [],
  );

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
    () => selectOptions.map((value) => toDisplayModelOption(value)),
    [selectOptions],
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

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Chat</h2>

      <div className="settings-row settings-row-stack settings-row-no-pad">
        <div className="settings-row-text">
          <div className="settings-row-label">Model selector</div>
          <p className="settings-row-description">
            Choose up to {CHAT_MODEL_SELECTOR_MAX} models for the chat input model picker. Search by
            provider or model name. Leave empty to use the default curated list.
          </p>
        </div>

        {canAddMore ? (
          <div ref={rootRef} className="settings-model-dropdown">
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
                      <span className="settings-model-option-main">
                        <span className="settings-model-option-lab">{item.lab}</span>
                        <span className="settings-model-option-name">{item.modelName}</span>
                      </span>
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

        {selectedModels.length > 0 ? (
          <ul className="settings-selected-models" aria-label="Selected chat models">
            {selectedModels.map((modelRef) => {
              const option = toDisplayModelOption(modelRef);
              return (
                <li key={modelRef} className="settings-selected-model">
                  <span className="settings-selected-model-name">
                    {option.lab}/{option.modelName}
                    {option.isFree ? " (Free)" : ""}
                  </span>
                  <button
                    type="button"
                    className="settings-button settings-button-ghost"
                    disabled={saving}
                    onClick={() => void removeModel(modelRef)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="settings-muted">Using default curated models.</p>
        )}

        {loadingOptions ? (
          <p className="settings-muted">Loading available models from current session…</p>
        ) : null}
        {error ? <p className="settings-error">{error}</p> : null}
      </div>
    </div>
  );
}
