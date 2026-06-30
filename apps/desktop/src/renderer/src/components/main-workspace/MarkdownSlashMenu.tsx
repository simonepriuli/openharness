import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef } from "react";
import {
  filterMarkdownSlashCommands,
  groupMarkdownSlashCommands,
  MARKDOWN_SLASH_COMMANDS,
  type MarkdownSlashCommand,
} from "./markdown-slash-commands";

type FlatRow =
  | { kind: "header"; section: string }
  | { kind: "item"; command: MarkdownSlashCommand; index: number };

function buildFlatRows(commands: MarkdownSlashCommand[]): FlatRow[] {
  const rows: FlatRow[] = [];
  let itemIndex = 0;
  for (const group of groupMarkdownSlashCommands(commands)) {
    rows.push({ kind: "header", section: group.section });
    for (const command of group.items) {
      rows.push({ kind: "item", command, index: itemIndex });
      itemIndex += 1;
    }
  }
  return rows;
}

type MarkdownSlashMenuProps = {
  query: string;
  selectedIndex: number | null;
  onHighlightIndex: (index: number) => void;
  onSelect: (command: MarkdownSlashCommand) => void;
};

export function MarkdownSlashMenu({
  query,
  selectedIndex,
  onHighlightIndex,
  onSelect,
}: MarkdownSlashMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(
    () => filterMarkdownSlashCommands(MARKDOWN_SLASH_COMMANDS, query),
    [query],
  );
  const flatRows = useMemo(() => buildFlatRows(filtered), [filtered]);
  const selectableRows = flatRows.filter(
    (row): row is Extract<FlatRow, { kind: "item" }> => row.kind === "item",
  );

  useEffect(() => {
    if (selectedIndex === null) return;
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-slash-index="${selectedIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, flatRows]);

  return (
    <div className="work-mode-markdown-slash-menu" role="listbox" aria-label="Insert block">
      <div ref={listRef} className="work-mode-markdown-slash-list">
        {selectableRows.length === 0 ? (
          <div className="work-mode-markdown-slash-empty">No matches</div>
        ) : (
          flatRows.map((row) => {
            if (row.kind === "header") {
              return (
                <div key={`header-${row.section}`} className="work-mode-markdown-slash-section">
                  {row.section}
                </div>
              );
            }

            const { command, index } = row;
            return (
              <button
                key={command.id}
                type="button"
                role="option"
                data-slash-index={index}
                aria-selected={index === selectedIndex}
                className={`work-mode-markdown-slash-item${
                  index === selectedIndex ? " work-mode-markdown-slash-item-selected" : ""
                }`}
                onMouseEnter={() => onHighlightIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(command);
                }}
              >
                <span className="work-mode-markdown-slash-item-icon" aria-hidden>
                  <HugeiconsIcon icon={command.icon} size={15} strokeWidth={1.75} />
                </span>
                <span className="work-mode-markdown-slash-item-label">{command.label}</span>
                {command.shortcut ? (
                  <span className="work-mode-markdown-slash-item-shortcut">{command.shortcut}</span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      <div className="work-mode-markdown-slash-footer">
        <span className="work-mode-markdown-slash-footer-hint">
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <span>navigate</span>
        </span>
        <span className="work-mode-markdown-slash-footer-hint">
          <kbd>↵</kbd>
          <span>select</span>
        </span>
        <span className="work-mode-markdown-slash-footer-hint">
          <kbd>esc</kbd>
          <span>close</span>
        </span>
      </div>
    </div>
  );
}
