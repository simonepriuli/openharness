import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuitIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { HarnessModelInfo, HarnessState, ThinkingLevel } from "../../../preload/api";
import {
  formatModelInfo,
  isMaxThinkingLevel,
  maxThinkingLevelForModel,
  modelKey,
  modelRequiresMaxThinking,
  parseModelFromState,
  pickSwitcherModels,
  toSwitcherModel,
  type SwitcherModel,
} from "../lib/model-display";

const SEARCH_RESULT_LIMIT = 50;

function matchesQuery(model: HarnessModelInfo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const display = formatModelInfo(model);
  const haystack = [
    model.provider,
    model.id,
    model.name ?? "",
    display.primary,
    display.secondary ?? "",
    modelKey(model),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function IconChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 4.5 6 7.5 9 4.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 7 5.5 10 11.5 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ModelSwitcherProps {
  sessionKey: string | null;
  disabled?: boolean;
  visibleModelRefs?: string[];
  onModelChange?: () => void;
  onAddModels?: () => void;
  /** Called after reading session state so the parent can apply rekeys (draft → file). */
  onSessionStateSynced?: (sessionKey: string, state: HarnessState | null) => void;
}

export function ModelSwitcher({
  sessionKey,
  disabled = false,
  visibleModelRefs = [],
  onModelChange,
  onAddModels,
  onSessionStateSynced,
}: ModelSwitcherProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<SwitcherModel[]>([]);
  const [availableModels, setAvailableModels] = useState<HarnessModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<HarnessModelInfo | null>(null);
  const [maxMode, setMaxMode] = useState(false);
  const [thinkingSupported, setThinkingSupported] = useState(false);

  const onSessionStateSyncedRef = useRef(onSessionStateSynced);
  onSessionStateSyncedRef.current = onSessionStateSynced;
  const modelsCacheRef = useRef(
    new Map<string, { pinned: SwitcherModel[]; available: HarnessModelInfo[] }>(),
  );
  const loadRequestRef = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
    setActionError(null);
  }, []);

  const applyState = useCallback((state: HarnessState | null) => {
    const model = parseModelFromState(state?.model ?? null);
    setSelectedModel(model);
    const requiresMax = modelRequiresMaxThinking(model);
    setMaxMode(requiresMax || isMaxThinkingLevel(state?.thinkingLevel));
    setThinkingSupported(model?.reasoning !== false);
  }, []);

  const ensureRequiredThinking = useCallback(async (key: string, state: HarnessState | null) => {
    const model = parseModelFromState(state?.model ?? null);
    if (!model || !modelRequiresMaxThinking(model)) return state;
    if (isMaxThinkingLevel(state?.thinkingLevel)) return state;

    const level = maxThinkingLevelForModel(model);
    const response = await window.harness.setThinkingLevel({ sessionKey: key, level });
    if (!response.success) return state;
    return window.harness.getState({ sessionKey: key });
  }, []);

  const syncFromSession = useCallback(async (key: string) => {
    try {
      let state = await window.harness.getState({ sessionKey: key });
      onSessionStateSyncedRef.current?.(key, state);
      state = (await ensureRequiredThinking(key, state)) ?? state;
      onSessionStateSyncedRef.current?.(key, state);
      applyState(state);
    } catch {
      setSelectedModel(null);
      setMaxMode(false);
      setThinkingSupported(false);
    }
  }, [applyState, ensureRequiredThinking]);

  const loadModels = useCallback(async (key: string, options?: { background?: boolean }) => {
    if (!key || disabled) {
      setModels([]);
      setAvailableModels([]);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }

    const requestId = ++loadRequestRef.current;
    const cached = modelsCacheRef.current.get(key);
    const background = options?.background === true;

    if (cached) {
      setModels(cached.pinned);
      setAvailableModels(cached.available);
      setModelsError(null);
      if (!background) setModelsLoading(false);
    } else if (!background) {
      setModelsLoading(true);
      setModelsError(null);
    }

    try {
      let available = await window.harness.getAvailableModels({ sessionKey: key });
      if (available.length === 0) {
        await new Promise((r) => window.setTimeout(r, 250));
        available = await window.harness.getAvailableModels({ sessionKey: key });
      }
      if (requestId !== loadRequestRef.current) return;

      const list = pickSwitcherModels(available, visibleModelRefs);
      modelsCacheRef.current.set(key, { pinned: list, available });
      setModels(list);
      setAvailableModels(available);
      if (list.length === 0) {
        setModelsError(
          available.length === 0
            ? "No models configured for this project."
            : "No matching models for the switcher.",
        );
      } else {
        setModelsError(null);
      }
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setModels([]);
      setAvailableModels([]);
      setModelsError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      if (requestId === loadRequestRef.current) {
        setModelsLoading(false);
      }
    }
  }, [disabled, visibleModelRefs]);

  useEffect(() => {
    modelsCacheRef.current.clear();
    if (!sessionKey || disabled) return;
    void loadModels(sessionKey);
  }, [visibleModelRefs, sessionKey, disabled, loadModels]);

  useEffect(() => {
    if (!sessionKey || disabled) {
      setSelectedModel(null);
      setMaxMode(false);
      setThinkingSupported(false);
      return;
    }
    void syncFromSession(sessionKey);
  }, [sessionKey, disabled, syncFromSession]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const key = sessionKey;
    if (!key || disabled) return () => window.clearTimeout(t);

    const cached = modelsCacheRef.current.get(key);
    if (cached) {
      setModels(cached.pinned);
      setAvailableModels(cached.available);
      setModelsError(null);
      setModelsLoading(false);
    }

    let cancelled = false;
    void (async () => {
      await syncFromSession(key);
      if (!cancelled) await loadModels(key, { background: Boolean(cached) });
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open]);

  const prevSessionKeyRef = useRef(sessionKey);
  useEffect(() => {
    const prev = prevSessionKeyRef.current;
    prevSessionKeyRef.current = sessionKey;
    if (!open || !sessionKey || disabled || !prev || prev === sessionKey) return;

    const cachedFromPrev = modelsCacheRef.current.get(prev);
    if (cachedFromPrev) {
      modelsCacheRef.current.set(sessionKey, cachedFromPrev);
      setModels(cachedFromPrev.pinned);
      setAvailableModels(cachedFromPrev.available);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }

    void loadModels(sessionKey, { background: models.length > 0 });
  }, [sessionKey, open, disabled, loadModels, models.length]);

  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;
  const searchResults = useMemo(
    () =>
      isSearching
        ? availableModels
            .filter((model) => matchesQuery(model, query))
            .slice(0, SEARCH_RESULT_LIMIT)
            .map(toSwitcherModel)
        : [],
    [availableModels, isSearching, query],
  );
  const visibleModels = isSearching ? searchResults : models;
  const showEmpty =
    !modelsLoading && !modelsError && isSearching && searchResults.length === 0;

  const pick = async (model: SwitcherModel) => {
    if (!sessionKey || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const response = await window.harness.setModel({
        sessionKey,
        provider: model.provider,
        modelId: model.id,
      });
      if (!response.success) {
        setActionError(response.error ?? "Failed to switch model");
        return;
      }
      await syncFromSession(sessionKey);
      onModelChange?.();
      close();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to switch model");
    } finally {
      setActionLoading(false);
    }
  };

  const toggleMaxMode = async () => {
    if (!sessionKey || !thinkingSupported || actionLoading) return;
    if (modelRequiresMaxThinking(selectedModel)) return;
    setActionLoading(true);
    setActionError(null);
    const nextOn = !maxMode;
    const level: ThinkingLevel = nextOn
      ? maxThinkingLevelForModel(selectedModel)
      : "off";
    try {
      const response = await window.harness.setThinkingLevel({ sessionKey, level });
      if (!response.success) {
        setActionError(response.error ?? "Failed to update thinking level");
        return;
      }
      setMaxMode(nextOn);
      await syncFromSession(sessionKey);
      onModelChange?.();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update thinking level",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const triggerLabel = useMemo(() => {
    if (!selectedModel) return "Model";
    const slot = models.find((m) => modelKey(m) === modelKey(selectedModel));
    if (slot) return slot.display.primary;
    return toSwitcherModel(selectedModel).display.primary;
  }, [selectedModel, models]);

  const isUnavailable = disabled || !sessionKey;
  const maxThinkingLocked = modelRequiresMaxThinking(selectedModel);
  const showReasoningChip = thinkingSupported;

  return (
    <div ref={rootRef} className="model-switcher">
      {showReasoningChip && (
        <button
          type="button"
          role="switch"
          className={`composer-mode-chip model-switcher-reasoning-chip${maxMode ? " model-switcher-reasoning-chip-on" : " model-switcher-reasoning-chip-off"}`}
          aria-label="Toggle thinking mode"
          aria-checked={maxMode}
          disabled={isUnavailable || actionLoading || maxThinkingLocked}
          title={
            maxThinkingLocked
              ? "This model requires extended thinking"
              : maxMode
                ? "Disable extended thinking"
                : "Enable extended thinking"
          }
          onClick={() => void toggleMaxMode()}
        >
          <span className="composer-mode-chip-icon" aria-hidden>
            <HugeiconsIcon icon={BrainCircuitIcon} size={11} strokeWidth={1.8} />
          </span>
          Thinking
        </button>
      )}
      <button
        type="button"
        className="model-switcher-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Model: ${triggerLabel}`}
        disabled={isUnavailable}
        onClick={() => {
          if (isUnavailable) return;
          setOpen((v) => !v);
        }}
      >
        <span className="model-switcher-trigger-label">{triggerLabel}</span>
        <IconChevronDown />
      </button>

      {open && (
        <div className="model-switcher-panel" role="dialog" aria-label="Choose model">
          <div className="model-switcher-panel-top">
            <input
              ref={searchRef}
              type="search"
              className="model-switcher-search"
              placeholder="Search all models"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search models"
              disabled={actionLoading}
            />
          </div>

          {actionError && (
            <div className="model-switcher-error" role="alert">
              {actionError}
            </div>
          )}

          {modelsLoading && (
            <div className="model-switcher-empty">Loading models…</div>
          )}

          {!isSearching && !modelsLoading && modelsError && (
            <div className="model-switcher-empty">{modelsError}</div>
          )}

          {showEmpty && (
            <div className="model-switcher-empty">No matching models</div>
          )}

          {!modelsLoading && (!modelsError || isSearching) && visibleModels.length > 0 && (
            <ul
              className="model-switcher-section"
              role="listbox"
              aria-label={isSearching ? "Search results" : "Models"}
            >
              {visibleModels.map((item) => {
                const selected =
                  selectedModel !== null && modelKey(item) === modelKey(selectedModel);
                const display = item.display;
                return (
                  <li key={modelKey(item)}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`model-switcher-row${selected ? " model-switcher-row-selected" : ""}`}
                      disabled={actionLoading}
                      onClick={() => void pick(item)}
                    >
                      <span className="model-switcher-row-label">
                        <span className="model-switcher-row-primary">{display.primary}</span>
                        {display.secondary && (
                          <span className="model-switcher-row-secondary">
                            {display.secondary}
                          </span>
                        )}
                      </span>
                      {selected && (
                        <span className="model-switcher-check">
                          <IconCheck />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="model-switcher-divider" aria-hidden />
          <button
            type="button"
            className="model-switcher-add"
            onClick={() => {
              close();
              onAddModels?.();
            }}
          >
            Add Models
          </button>
        </div>
      )}
    </div>
  );
}
