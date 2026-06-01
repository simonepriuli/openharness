import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ModelCategoryId = "auto" | "premium";

type SpecificModelId =
  | "composer-2.5"
  | "opus-4.8"
  | "gpt-5.5"
  | "sonnet-4.6"
  | "codex-5.3";

export type ModelSelection =
  | { kind: "category"; id: ModelCategoryId }
  | { kind: "model"; id: SpecificModelId };

const STORAGE_KEY = "openharness:model-selection";
const MAX_MODE_KEY = "openharness:max-mode";

const CATEGORIES: { id: ModelCategoryId; label: string; descriptor: string }[] = [
  { id: "auto", label: "Auto", descriptor: "Efficiency" },
  { id: "premium", label: "Premium", descriptor: "Intelligence" },
];

const MODELS: { id: SpecificModelId; label: string; descriptor: string }[] = [
  { id: "composer-2.5", label: "Composer 2.5", descriptor: "Fast" },
  { id: "opus-4.8", label: "Opus 4.8", descriptor: "High" },
  { id: "gpt-5.5", label: "GPT-5.5", descriptor: "Medium" },
  { id: "sonnet-4.6", label: "Sonnet 4.6", descriptor: "Medium" },
  { id: "codex-5.3", label: "Codex 5.3", descriptor: "Medium" },
];

function readStoredSelection(): ModelSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { kind: "category", id: "auto" };
    const parsed = JSON.parse(raw) as ModelSelection;
    if (parsed.kind === "category" && CATEGORIES.some((c) => c.id === parsed.id)) {
      return parsed;
    }
    if (parsed.kind === "model" && MODELS.some((m) => m.id === parsed.id)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return { kind: "category", id: "auto" };
}

function readStoredMaxMode(): boolean {
  try {
    return localStorage.getItem(MAX_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function selectionLabel(selection: ModelSelection): string {
  if (selection.kind === "category") {
    return CATEGORIES.find((c) => c.id === selection.id)?.label ?? "Auto";
  }
  return MODELS.find((m) => m.id === selection.id)?.label ?? "Auto";
}

function matchesQuery(label: string, descriptor: string, query: string): boolean {
  const haystack = `${label} ${descriptor}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
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
  disabled?: boolean;
}

export function ModelSwitcher({ disabled = false }: ModelSwitcherProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<ModelSelection>(readStoredSelection);
  const [maxMode, setMaxMode] = useState(readStoredMaxMode);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

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
    return () => window.clearTimeout(t);
  }, [open]);

  const query = search.trim().toLowerCase();
  const filteredCategories = useMemo(
    () =>
      query
        ? CATEGORIES.filter((c) => matchesQuery(c.label, c.descriptor, query))
        : CATEGORIES,
    [query],
  );
  const filteredModels = useMemo(
    () =>
      query ? MODELS.filter((m) => matchesQuery(m.label, m.descriptor, query)) : MODELS,
    [query],
  );

  const isSelected = (candidate: ModelSelection) =>
    selection.kind === candidate.kind && selection.id === candidate.id;

  const pick = (next: ModelSelection) => {
    setSelection(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    close();
  };

  const toggleMaxMode = () => {
    setMaxMode((on) => {
      const next = !on;
      try {
        localStorage.setItem(MAX_MODE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const triggerLabel = selectionLabel(selection);
  const showEmpty =
    query.length > 0 && filteredCategories.length === 0 && filteredModels.length === 0;

  return (
    <div ref={rootRef} className="model-switcher">
      <button
        type="button"
        className="model-switcher-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Model: ${triggerLabel}`}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
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
              placeholder="Search models"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search models"
            />
            <div className="model-switcher-max-row">
              <span className="model-switcher-max-label">MAX Mode</span>
              <button
                type="button"
                role="switch"
                className={`model-switcher-toggle${maxMode ? " model-switcher-toggle-on" : ""}`}
                aria-checked={maxMode}
                onClick={toggleMaxMode}
              >
                <span className="model-switcher-toggle-thumb" />
              </button>
            </div>
          </div>

          {showEmpty ? (
            <div className="model-switcher-empty">No matching models</div>
          ) : (
            <>
              {filteredCategories.length > 0 && (
                <ul className="model-switcher-section" role="listbox" aria-label="Categories">
                  {filteredCategories.map((item) => {
                    const candidate: ModelSelection = { kind: "category", id: item.id };
                    const selected = isSelected(candidate);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`model-switcher-row${selected ? " model-switcher-row-selected" : ""}`}
                          onClick={() => pick(candidate)}
                        >
                          <span className="model-switcher-row-label">
                            <span className="model-switcher-row-primary">{item.label}</span>
                            <span className="model-switcher-row-secondary">
                              {item.descriptor}
                            </span>
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

              {filteredCategories.length > 0 && filteredModels.length > 0 && (
                <div className="model-switcher-divider" aria-hidden />
              )}

              {filteredModels.length > 0 && (
                <ul className="model-switcher-section" role="listbox" aria-label="Models">
                  {filteredModels.map((item) => {
                    const candidate: ModelSelection = { kind: "model", id: item.id };
                    const selected = isSelected(candidate);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`model-switcher-row${selected ? " model-switcher-row-selected" : ""}`}
                          onClick={() => pick(candidate)}
                        >
                          <span className="model-switcher-row-label">
                            <span className="model-switcher-row-primary">{item.label}</span>
                            <span className="model-switcher-row-secondary">
                              {item.descriptor}
                            </span>
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
            </>
          )}

          <div className="model-switcher-divider" aria-hidden />
          <button type="button" className="model-switcher-add" onClick={close}>
            Add Models
          </button>
        </div>
      )}
    </div>
  );
}
