import { useEffect, useMemo, useRef, useState } from "react";
import type { HarnessModelInfo, HarnessSettings } from "../../../../preload/api";
import { formatModelRefLabel, toDisplayModelOption } from "../../lib/model-ref-display";
import { SettingsCard } from "./SettingsCard";

type SwarmSettingsProps = {
  settings: HarnessSettings;
  saving: boolean;
  sessionKey: string | null;
  onSaveSwarmDefaultModel: (modelRef: string) => Promise<void>;
};

export function SwarmSettings({
  settings,
  saving,
  sessionKey,
  onSaveSwarmDefaultModel,
}: SwarmSettingsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [defaultModel, setDefaultModel] = useState(settings.swarmDefaultModel);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(settings.swarmDefaultModel);
  const [options, setOptions] = useState<HarnessModelInfo[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    setDefaultModel(settings.swarmDefaultModel);
    setSearch(settings.swarmDefaultModel);
  }, [settings.swarmDefaultModel]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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

  const selectOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const model of options) {
      unique.add(`${model.provider}/${model.id}`);
    }
    if (unique.size === 0) {
      for (const fallback of fallbackOptions) unique.add(fallback);
    }
    if (defaultModel.trim()) unique.add(defaultModel.trim());
    return [...unique];
  }, [options, fallbackOptions, defaultModel]);

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

  const selectedOption = useMemo(
    () => (defaultModel.trim() ? toDisplayModelOption(defaultModel.trim()) : null),
    [defaultModel],
  );

  const triggerLabel = selectedOption
    ? formatModelRefLabel(selectedOption)
    : "Select swarm model";

  const saveSelection = async (modelRef: string) => {
    setError(null);
    setSavedMessage(null);
    try {
      const next = modelRef.trim();
      await onSaveSwarmDefaultModel(next);
      setSavedMessage(`Swarm default model set to ${next}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save swarm settings");
    }
  };

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Swarm</h2>

      <SettingsCard title="Default sub-agent model" padded={false} overflowVisible>
      <div className="settings-row">
        <div className="settings-row-text">
          <p className="settings-row-description">
            Model used by <code>swarm_dispatch</code> when a sub-agent model is not specified.
          </p>
          {loadingOptions ? (
            <p className="settings-muted settings-row-feedback">
              Loading available models from current session…
            </p>
          ) : null}
          {error ? <p className="settings-error settings-row-feedback">{error}</p> : null}
          {savedMessage ? (
            <p className="settings-status settings-row-feedback">{savedMessage}</p>
          ) : null}
        </div>

        <div ref={rootRef} className="settings-model-dropdown">
          <button
            type="button"
            className="settings-model-trigger"
            aria-expanded={open}
            aria-haspopup="listbox"
            disabled={saving}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="settings-model-trigger-label">{triggerLabel}</span>
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
            <div className="settings-model-panel" role="dialog" aria-label="Select swarm model">
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

              <div className="settings-model-list" role="listbox" aria-label="Swarm models">
                {filteredOptions.map((item) => {
                  const selected = item.value === defaultModel.trim();
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`settings-model-option${selected ? " settings-model-option-selected" : ""}`}
                      disabled={saving}
                      onClick={() => {
                        setDefaultModel(item.value);
                        setSearch(`${item.lab}/${item.modelName}`);
                        setOpen(false);
                        void saveSelection(item.value);
                      }}
                    >
                      <span className="settings-model-option-main">
                        <span className="settings-model-option-lab">{item.lab}</span>
                        <span className="settings-model-option-name">{item.modelName}</span>
                      </span>
                      {item.isFree ? (
                        <span className="settings-model-option-badge">FREE</span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredOptions.length === 0 ? (
                  <div className="settings-model-empty">No matching models</div>
                ) : null}
              </div>
            </div>
          )}
        </div>

      </div>
      </SettingsCard>
    </div>
  );
}
