import { useEffect, useMemo, useRef, useState } from "react";
import type { HarnessModelInfo } from "../../../../preload/api";
import {
  formatModelRefLabel,
  modelRefFromParts,
  resolveDisplayModelOption,
} from "../../lib/model-ref-display";
import { SettingsModelOptionContent } from "./SettingsModelOptionContent";

type SettingsModelPickerProps = {
  value: string;
  onChange: (modelRef: string) => void;
  sessionKey?: string | null;
  disabled?: boolean;
  emptyLabel?: string;
  emptyOptionLabel?: string;
  allowEmpty?: boolean;
  panelAriaLabel?: string;
  listAriaLabel?: string;
  className?: string;
};

function ModelPickerChevron() {
  return (
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
  );
}

export function SettingsModelPicker({
  value,
  onChange,
  sessionKey = null,
  disabled = false,
  emptyLabel = "Select model",
  emptyOptionLabel,
  allowEmpty = false,
  panelAriaLabel = "Select model",
  listAriaLabel = "Models",
  className,
}: SettingsModelPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<HarnessModelInfo[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

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

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
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
        setOptions(
          models.filter(
            (model): model is HarnessModelInfo =>
              Boolean(
                model &&
                  typeof model === "object" &&
                  typeof model.provider === "string" &&
                  model.provider.trim().length > 0 &&
                  typeof model.id === "string" &&
                  model.id.trim().length > 0,
              ),
          ),
        );
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

  const modelInfoByRef = useMemo(() => {
    const map = new Map<string, HarnessModelInfo>();
    for (const model of options) {
      map.set(modelRefFromParts(model.provider, model.id), model);
    }
    return map;
  }, [options]);

  const selectedOption = useMemo(
    () => (value.trim() ? resolveDisplayModelOption(value.trim(), modelInfoByRef) : null),
    [value, modelInfoByRef],
  );

  const triggerLabel = selectedOption ? formatModelRefLabel(selectedOption) : emptyLabel;

  const selectOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const model of options) {
      unique.add(modelRefFromParts(model.provider, model.id));
    }
    if (value.trim()) unique.add(value.trim());
    return [...unique];
  }, [options, value]);

  const displayOptions = useMemo(
    () => selectOptions.map((modelRef) => resolveDisplayModelOption(modelRef, modelInfoByRef)),
    [selectOptions, modelInfoByRef],
  );

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return displayOptions.slice(0, 100);
    return displayOptions.filter((item) => item.searchText.includes(query)).slice(0, 100);
  }, [search, displayOptions]);

  const openPicker = () => {
    setSearch(selectedOption ? formatModelRefLabel(selectedOption) : "");
    setOpen(true);
  };

  const selectModel = (modelRef: string) => {
    onChange(modelRef);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`settings-model-dropdown${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        className="settings-model-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled || loadingOptions}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className="settings-model-trigger-label">{triggerLabel}</span>
        <ModelPickerChevron />
      </button>

      {open ? (
        <div className="settings-model-panel" role="dialog" aria-label={panelAriaLabel}>
          <input
            ref={searchRef}
            type="search"
            className="settings-model-search"
            value={search}
            placeholder="Search model (provider/model)"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="settings-model-list" role="listbox" aria-label={listAriaLabel}>
            {allowEmpty ? (
              <button
                type="button"
                role="option"
                aria-selected={!value.trim()}
                className={`settings-model-option${!value.trim() ? " settings-model-option-selected" : ""}`}
                disabled={disabled}
                onClick={() => selectModel("")}
              >
                <span className="settings-model-option-main">
                  <span className="settings-model-option-name">
                    {emptyOptionLabel ?? emptyLabel}
                  </span>
                </span>
              </button>
            ) : null}
            {filteredOptions.map((item) => {
              const selected = item.value === value.trim();
              return (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`settings-model-option${selected ? " settings-model-option-selected" : ""}`}
                  disabled={disabled}
                  onClick={() => selectModel(item.value)}
                >
                  <SettingsModelOptionContent option={item} />
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
      ) : null}
    </div>
  );
}
