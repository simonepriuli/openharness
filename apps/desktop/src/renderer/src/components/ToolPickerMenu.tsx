import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import {
  groupSlashMenuItems,
  listSelectableSlashMenuItems,
  type SlashMenuItem,
  type ToolSection,
} from "../../../shared/thread-tools";
import { ToolSectionIcon } from "./ToolSectionIcon";

interface ToolPickerMenuProps {
  items: SlashMenuItem[];
  query: string;
  selectedIndex: number;
  loading: boolean;
  onSelect: (item: SlashMenuItem) => void;
  anchorStyle?: CSSProperties;
}

type FlatRow =
  | { kind: "header"; section: ToolSection; label: string }
  | { kind: "item"; item: SlashMenuItem; index: number };

function buildFlatRows(items: SlashMenuItem[]): FlatRow[] {
  const rows: FlatRow[] = [];
  let itemIndex = 0;
  for (const group of groupSlashMenuItems(items)) {
    rows.push({ kind: "header", section: group.section, label: group.label });
    for (const item of group.items) {
      rows.push({ kind: "item", item, index: itemIndex });
      itemIndex += 1;
    }
  }
  return rows;
}

export function ToolPickerMenu({
  items,
  query,
  selectedIndex,
  loading,
  onSelect,
  anchorStyle,
}: ToolPickerMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectableItems = useMemo(() => listSelectableSlashMenuItems(items, query), [items, query]);
  const flatRows = useMemo(() => buildFlatRows(selectableItems), [selectableItems]);
  const selectableRows = flatRows.filter((row): row is Extract<FlatRow, { kind: "item" }> => row.kind === "item");

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-tool-index="${selectedIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, flatRows]);

  return (
    <div
      className={`tool-picker-menu${anchorStyle ? " tool-picker-menu-anchored" : ""}`}
      style={anchorStyle}
      role="listbox"
      aria-label="Tools and skills"
    >
      {loading && items.length === 0 && (
        <div className="tool-picker-empty">Loading…</div>
      )}
      {!loading && items.length === 0 && (
        <div className="tool-picker-empty">No tools available</div>
      )}
      {!loading && items.length > 0 && selectableRows.length === 0 && (
        <div className="tool-picker-empty">No matches</div>
      )}
      <div ref={listRef} className="tool-picker-list">
        {flatRows.map((row) => {
          if (row.kind === "header") {
            return (
              <div key={`header-${row.section}`} className="tool-picker-section-header">
                {row.label}
              </div>
            );
          }
          const { item, index } = row;
          return (
            <button
              key={item.toolId}
              type="button"
              role="option"
              data-tool-index={index}
              aria-selected={index === selectedIndex}
              aria-label={item.description ? `${item.label}. ${item.description}` : item.label}
              title={item.description || undefined}
              className={`tool-picker-item${index === selectedIndex ? " tool-picker-item-selected" : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
            >
              <span className="tool-picker-item-icon" aria-hidden>
                <ToolSectionIcon section={item.section} toolId={item.toolId} size={14} />
              </span>
              <span className="tool-picker-item-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
