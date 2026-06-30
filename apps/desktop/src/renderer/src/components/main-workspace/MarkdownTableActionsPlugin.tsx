import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $getTableCellNodeFromLexicalNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
} from "@lexical/table";
import { $getNearestNodeFromDOMNode } from "lexical";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type LineGeometry = {
  /** Viewport position (px) of each cell's start edge plus the final end edge. */
  boundaries: number[];
  /** Viewport center (px) of each cell. */
  centers: number[];
  /** Start of the table on the cross axis (px). */
  crossStart: number;
  /** End of the table on the cross axis (px). */
  crossEnd: number;
};

type TableGeometry = {
  rect: DOMRect;
  /** Visible bounds of the editor scroll container (px), used to clamp controls. */
  bounds: DOMRect;
  columns: LineGeometry;
  rows: LineGeometry;
};

const BUTTON = 16;
const HALF = BUTTON / 2;
/** Distance from the table edge to the near edge of a control button. */
const GUTTER = 10;
/** Offset of a control button's top/left from the table edge. */
const OFFSET = GUTTER + BUTTON;

function getTableRows(table: HTMLElement): HTMLTableRowElement[] {
  const direct = Array.from(
    table.querySelectorAll<HTMLTableRowElement>(":scope > tr"),
  );
  if (direct.length > 0) return direct;
  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"));
}

function computeGeometry(table: HTMLElement): TableGeometry | null {
  const rows = getTableRows(table);
  if (rows.length === 0) return null;

  const firstRowCells = Array.from(rows[0].children) as HTMLElement[];
  if (firstRowCells.length === 0) return null;

  const rect = table.getBoundingClientRect();
  const editor = table.closest<HTMLElement>(".work-mode-markdown-editor");
  const bounds = (editor ?? table).getBoundingClientRect();

  const columnBoundaries: number[] = [];
  const columnCenters: number[] = [];
  firstRowCells.forEach((cell, index) => {
    const cellRect = cell.getBoundingClientRect();
    if (index === 0) columnBoundaries.push(cellRect.left);
    columnBoundaries.push(cellRect.right);
    columnCenters.push(cellRect.left + cellRect.width / 2);
  });

  const rowBoundaries: number[] = [];
  const rowCenters: number[] = [];
  rows.forEach((row, index) => {
    const firstCell = row.children[0] as HTMLElement | undefined;
    if (!firstCell) return;
    const cellRect = firstCell.getBoundingClientRect();
    if (index === 0) rowBoundaries.push(cellRect.top);
    rowBoundaries.push(cellRect.bottom);
    rowCenters.push(cellRect.top + cellRect.height / 2);
  });

  return {
    rect,
    bounds,
    columns: {
      boundaries: columnBoundaries,
      centers: columnCenters,
      crossStart: rect.top,
      crossEnd: rect.bottom,
    },
    rows: {
      boundaries: rowBoundaries,
      centers: rowCenters,
      crossStart: rect.left,
      crossEnd: rect.right,
    },
  };
}

export function MarkdownTableActionsPlugin() {
  const [editor] = useLexicalComposerContext();
  const [activeTable, setActiveTable] = useState<HTMLElement | null>(null);
  const [geometry, setGeometry] = useState<TableGeometry | null>(null);
  const hideTimer = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const refreshGeometry = useCallback(() => {
    if (!activeTable || !activeTable.isConnected) {
      setGeometry(null);
      return;
    }
    setGeometry(computeGeometry(activeTable));
  }, [activeTable]);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const onPointerOver = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const table = target?.closest<HTMLElement>(".work-mode-markdown-table");
      if (table) {
        clearHideTimer();
        setActiveTable((current) => (current === table ? current : table));
      }
    };

    root.addEventListener("pointerover", onPointerOver);
    return () => {
      root.removeEventListener("pointerover", onPointerOver);
    };
  }, [editor, clearHideTimer]);

  useEffect(() => {
    if (!activeTable) return;

    const onPointerMove = (event: PointerEvent) => {
      const rect = activeTable.getBoundingClientRect();
      const within =
        event.clientX >= rect.left - OFFSET - 6 &&
        event.clientX <= rect.right + 6 &&
        event.clientY >= rect.top - OFFSET - 6 &&
        event.clientY <= rect.bottom + 6;
      if (within) {
        clearHideTimer();
        return;
      }
      if (hideTimer.current == null) {
        hideTimer.current = window.setTimeout(() => {
          hideTimer.current = null;
          setActiveTable(null);
        }, 180);
      }
    };

    document.addEventListener("pointermove", onPointerMove);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      clearHideTimer();
    };
  }, [activeTable, clearHideTimer]);

  useLayoutEffect(() => {
    if (!activeTable) {
      setGeometry(null);
      return;
    }

    refreshGeometry();

    const scrollParent =
      activeTable.closest<HTMLElement>(".work-mode-markdown-editor") ?? window;
    const onScrollOrResize = () => refreshGeometry();

    scrollParent.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      scrollParent.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [activeTable, refreshGeometry]);

  const runTargetingCell = useCallback(
    (rowIndex: number, columnIndex: number, action: () => void) => {
      const table = activeTable;
      if (!table) return;
      const rows = getTableRows(table);
      const cellDom = rows[rowIndex]?.children[columnIndex] as HTMLElement | undefined;
      if (!cellDom) return;

      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(cellDom);
        if (!node) return;
        const cell = $getTableCellNodeFromLexicalNode(node);
        if (!cell) return;
        cell.selectEnd();
        action();
      });
      requestAnimationFrame(refreshGeometry);
    },
    [activeTable, editor, refreshGeometry],
  );

  const insertColumnAtBoundary = useCallback(
    (boundary: number) => {
      if (boundary <= 0) {
        runTargetingCell(0, 0, () => $insertTableColumnAtSelection(false));
      } else {
        runTargetingCell(0, boundary - 1, () => $insertTableColumnAtSelection(true));
      }
    },
    [runTargetingCell],
  );

  const insertRowAtBoundary = useCallback(
    (boundary: number) => {
      if (boundary <= 0) {
        runTargetingCell(0, 0, () => $insertTableRowAtSelection(false));
      } else {
        runTargetingCell(boundary - 1, 0, () => $insertTableRowAtSelection(true));
      }
    },
    [runTargetingCell],
  );

  const deleteColumn = useCallback(
    (columnIndex: number) => {
      runTargetingCell(0, columnIndex, () => $deleteTableColumnAtSelection());
    },
    [runTargetingCell],
  );

  const deleteRow = useCallback(
    (rowIndex: number) => {
      runTargetingCell(rowIndex, 0, () => $deleteTableRowAtSelection());
    },
    [runTargetingCell],
  );

  if (!activeTable || !geometry) return null;

  const { columns, rows, bounds } = geometry;
  const canDeleteColumn = columns.centers.length > 1;
  const canDeleteRow = rows.centers.length > 1;

  const stop = (event: React.MouseEvent) => event.preventDefault();

  const pad = 2;
  const clampX = (value: number) =>
    Math.min(Math.max(value, bounds.left + pad), bounds.right - BUTTON - pad);
  const clampY = (value: number) =>
    Math.min(Math.max(value, bounds.top + pad), bounds.bottom - BUTTON - pad);

  return createPortal(
    <div className="work-mode-markdown-table-controls" aria-hidden="false">
      {columns.boundaries.map((x, index) => (
        <button
          key={`col-add-${index}`}
          type="button"
          className="work-mode-markdown-table-add work-mode-markdown-table-add-col"
          title="Insert column"
          style={{
            left: `${clampX(x - HALF)}px`,
            top: `${clampY(columns.crossStart - OFFSET)}px`,
          }}
          onMouseDown={stop}
          onClick={() => insertColumnAtBoundary(index)}
        >
          <span aria-hidden="true">+</span>
        </button>
      ))}

      {columns.centers.map((x, index) => (
        <button
          key={`col-del-${index}`}
          type="button"
          className="work-mode-markdown-table-del work-mode-markdown-table-del-col"
          title="Delete column"
          disabled={!canDeleteColumn}
          style={{
            left: `${clampX(x - HALF)}px`,
            top: `${clampY(columns.crossStart - OFFSET)}px`,
          }}
          onMouseDown={stop}
          onClick={() => deleteColumn(index)}
        >
          <span aria-hidden="true">&minus;</span>
        </button>
      ))}

      {rows.boundaries.map((y, index) => (
        <button
          key={`row-add-${index}`}
          type="button"
          className="work-mode-markdown-table-add work-mode-markdown-table-add-row"
          title="Insert row"
          style={{
            top: `${clampY(y - HALF)}px`,
            left: `${clampX(rows.crossStart - OFFSET)}px`,
          }}
          onMouseDown={stop}
          onClick={() => insertRowAtBoundary(index)}
        >
          <span aria-hidden="true">+</span>
        </button>
      ))}

      {rows.centers.map((y, index) => (
        <button
          key={`row-del-${index}`}
          type="button"
          className="work-mode-markdown-table-del work-mode-markdown-table-del-row"
          title="Delete row"
          disabled={!canDeleteRow}
          style={{
            top: `${clampY(y - HALF)}px`,
            left: `${clampX(rows.crossStart - OFFSET)}px`,
          }}
          onMouseDown={stop}
          onClick={() => deleteRow(index)}
        >
          <span aria-hidden="true">&minus;</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
