import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { backupFile } from "./backup.js";
import { resolveOfficePath } from "./paths.js";

const DEFAULT_ROW_CAP = 100;
const DEFAULT_COL_CAP = 20;

export interface XlsxReadCell {
  value: string | number | boolean | null;
  formula?: string;
}

export interface ReadXlsxOptions {
  cwd: string;
  path: string;
  sheet?: string;
  startRow?: number;
  endRow?: number;
  startCol?: number;
  endCol?: number;
}

export interface ReadXlsxResult {
  path: string;
  sheetNames: string[];
  sheet: string;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  totalRows: number;
  totalCols: number;
  truncated: boolean;
  cells: Array<Array<XlsxReadCell>>;
}

export interface XlsxCellBorderStyle {
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
  color?: string;
  style?: "thin" | "medium" | "thick";
}

export interface XlsxCellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  fontColor?: string;
  fillColor?: string;
  numFmt?: string;
  border?: XlsxCellBorderStyle;
}

export type XlsxEditOperation =
  | { op: "set_cell"; sheet?: string; cell: string; value: string | number | boolean | null }
  | { op: "set_range"; sheet?: string; range: string; values: Array<Array<string | number | boolean | null>> }
  | { op: "set_formula"; sheet?: string; cell: string; formula: string; result?: string | number | boolean | null }
  | { op: "add_sheet"; name: string }
  | { op: "rename_sheet"; from: string; to: string }
  | { op: "delete_sheet"; sheet: string }
  | { op: "insert_rows"; sheet?: string; row: number; count?: number }
  | { op: "delete_rows"; sheet?: string; row: number; count?: number }
  | { op: "insert_columns"; sheet?: string; column: number; count?: number }
  | { op: "delete_columns"; sheet?: string; column: number; count?: number }
  | { op: "set_column_width"; sheet?: string; column: number; width: number }
  | { op: "merge_cells"; sheet?: string; range: string }
  | { op: "unmerge_cells"; sheet?: string; range: string }
  | { op: "set_cell_style"; sheet?: string; cell: string; style: XlsxCellStyle }
  | { op: "set_range_style"; sheet?: string; range: string; style: XlsxCellStyle };

function cellValueToJson(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object" && "formula" in value && typeof value.formula === "string") {
    if ("result" in value) {
      return cellValueToJson(value.result as ExcelJS.CellValue);
    }
    return null;
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  if (typeof value === "object" && "result" in value) {
    const result = value.result;
    if (result === null || result === undefined) return null;
    if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
      return result;
    }
  }
  return String(value);
}

function formatFormula(formula: string): string {
  const trimmed = formula.trim();
  return trimmed.startsWith("=") ? trimmed : `=${trimmed}`;
}

function normalizeFormula(formula: string): string {
  const trimmed = formula.trim();
  return trimmed.startsWith("=") ? trimmed.slice(1) : trimmed;
}

function readCell(cell: ExcelJS.Cell): XlsxReadCell {
  const formula = cell.formula;
  if (formula) {
    const rawResult = cell.result !== undefined && cell.result !== null ? cell.result : cell.value;
    return {
      value: cellValueToJson(rawResult),
      formula: formatFormula(formula),
    };
  }
  return { value: cellValueToJson(cell.value) };
}

function parseColor(color: string): { argb: string } {
  let hex = color.trim().replace(/^#/, "").toUpperCase();
  if (hex.length === 6) {
    hex = `FF${hex}`;
  }
  if (!/^[0-9A-F]{8}$/.test(hex)) {
    throw new Error(`Invalid color: ${color}`);
  }
  return { argb: hex };
}

function borderEdge(style: XlsxCellBorderStyle): Partial<ExcelJS.Border> {
  const edgeStyle = style.style ?? "thin";
  const edge: Partial<ExcelJS.Border> = { style: edgeStyle };
  if (style.color) {
    edge.color = parseColor(style.color);
  }
  return edge;
}

function applyCellStyle(cell: ExcelJS.Cell, style: XlsxCellStyle): void {
  const font: Partial<ExcelJS.Font> = { ...(cell.font ?? {}) };
  let fontChanged = false;
  if (style.bold !== undefined) {
    font.bold = style.bold;
    fontChanged = true;
  }
  if (style.italic !== undefined) {
    font.italic = style.italic;
    fontChanged = true;
  }
  if (style.underline !== undefined) {
    font.underline = style.underline;
    fontChanged = true;
  }
  if (style.strike !== undefined) {
    font.strike = style.strike;
    fontChanged = true;
  }
  if (style.fontColor) {
    font.color = parseColor(style.fontColor);
    fontChanged = true;
  }
  if (fontChanged) {
    cell.font = font;
  }

  if (style.fillColor) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: parseColor(style.fillColor),
    };
  }

  if (style.numFmt) {
    cell.numFmt = style.numFmt;
  }

  if (style.border) {
    const border: Partial<ExcelJS.Borders> = { ...(cell.border ?? {}) };
    if (style.border.top) border.top = borderEdge(style.border);
    if (style.border.bottom) border.bottom = borderEdge(style.border);
    if (style.border.left) border.left = borderEdge(style.border);
    if (style.border.right) border.right = borderEdge(style.border);
    cell.border = border;
  }
}

function applyStyleToRange(sheet: ExcelJS.Worksheet, range: string, style: XlsxCellStyle): void {
  const [startRef, endRef] = range.includes(":") ? range.split(":") : [range, range];
  if (!startRef || !endRef) {
    throw new Error(`Invalid range: ${range}`);
  }
  const startCell = sheet.getCell(startRef);
  const endCell = sheet.getCell(endRef);
  const startRow = Number(startCell.row);
  const startCol = Number(startCell.col);
  const endRow = Number(endCell.row);
  const endCol = Number(endCell.col);
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      applyCellStyle(sheet.getCell(row, col), style);
    }
  }
}

function getWorksheet(workbook: ExcelJS.Workbook, sheetName?: string): ExcelJS.Worksheet {
  if (sheetName) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      throw new Error(`Sheet not found: ${sheetName}`);
    }
    return sheet;
  }
  const first = workbook.worksheets[0];
  if (!first) {
    throw new Error("Workbook has no sheets.");
  }
  return first;
}

function measureSheet(sheet: ExcelJS.Worksheet): { totalRows: number; totalCols: number } {
  let totalRows = sheet.rowCount;
  let totalCols = sheet.columnCount;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    totalRows = Math.max(totalRows, rowNumber);
    row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
      totalCols = Math.max(totalCols, colNumber);
    });
  });
  return { totalRows, totalCols };
}

export async function readXlsx(options: ReadXlsxOptions): Promise<ReadXlsxResult> {
  const absolutePath = resolveOfficePath(options.cwd, options.path);
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${options.path}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolutePath);
  const sheet = getWorksheet(workbook, options.sheet);
  const { totalRows, totalCols } = measureSheet(sheet);

  const startRow = Math.max(1, options.startRow ?? 1);
  const startCol = Math.max(1, options.startCol ?? 1);
  const endRow = Math.min(totalRows || startRow + DEFAULT_ROW_CAP - 1, options.endRow ?? startRow + DEFAULT_ROW_CAP - 1);
  const endCol = Math.min(totalCols || startCol + DEFAULT_COL_CAP - 1, options.endCol ?? startCol + DEFAULT_COL_CAP - 1);

  const cells: Array<Array<XlsxReadCell>> = [];
  for (let row = startRow; row <= endRow; row += 1) {
    const rowCells: Array<XlsxReadCell> = [];
    for (let col = startCol; col <= endCol; col += 1) {
      rowCells.push(readCell(sheet.getCell(row, col)));
    }
    cells.push(rowCells);
  }

  const truncated = endRow < totalRows || endCol < totalCols;

  return {
    path: options.path,
    sheetNames: workbook.worksheets.map((ws) => ws.name),
    sheet: sheet.name,
    startRow,
    endRow,
    startCol,
    endCol,
    totalRows,
    totalCols,
    truncated,
    cells,
  };
}

export async function editXlsx(options: {
  cwd: string;
  path: string;
  operations: XlsxEditOperation[];
}): Promise<{ path: string; applied: number; created: boolean }> {
  const absolutePath = resolveOfficePath(options.cwd, options.path);
  const created = !existsSync(absolutePath);

  const workbook = new ExcelJS.Workbook();
  if (!created) {
    await workbook.xlsx.readFile(absolutePath);
    backupFile(absolutePath);
  }

  let applied = 0;
  for (const operation of options.operations) {
    if (operation.op === "add_sheet") {
      if (workbook.getWorksheet(operation.name)) {
        throw new Error(`Sheet already exists: ${operation.name}`);
      }
      workbook.addWorksheet(operation.name);
      applied += 1;
      continue;
    }

    if (operation.op === "rename_sheet") {
      const sheet = getWorksheet(workbook, operation.from);
      if (workbook.getWorksheet(operation.to)) {
        throw new Error(`Sheet already exists: ${operation.to}`);
      }
      sheet.name = operation.to;
      applied += 1;
      continue;
    }

    if (operation.op === "delete_sheet") {
      const sheet = getWorksheet(workbook, operation.sheet);
      workbook.removeWorksheet(sheet.id);
      applied += 1;
      continue;
    }

    const sheet = getWorksheet(workbook, "sheet" in operation ? operation.sheet : undefined);

    if (operation.op === "set_cell") {
      sheet.getCell(operation.cell).value = operation.value;
      applied += 1;
      continue;
    }

    if (operation.op === "set_formula") {
      const formulaValue: ExcelJS.CellFormulaValue = {
        formula: normalizeFormula(operation.formula),
      };
      if (operation.result !== undefined) {
        formulaValue.result = operation.result === null ? undefined : operation.result;
      }
      sheet.getCell(operation.cell).value = formulaValue;
      applied += 1;
      continue;
    }

    if (operation.op === "set_range") {
      const [startRef, endRef] = operation.range.includes(":")
        ? operation.range.split(":")
        : [operation.range, operation.range];
      if (!startRef || !endRef) {
        throw new Error(`Invalid range: ${operation.range}`);
      }
      const startCell = sheet.getCell(startRef);
      const endCell = sheet.getCell(endRef);
      const startRow = Number(startCell.row);
      const startCol = Number(startCell.col);
      const endRow = Number(endCell.row);
      const endCol = Number(endCell.col);

      if (operation.values.length === 0) {
        for (let row = startRow; row <= endRow; row += 1) {
          for (let col = startCol; col <= endCol; col += 1) {
            sheet.getCell(row, col).value = null;
          }
        }
      } else {
        for (let rowOffset = 0; rowOffset < operation.values.length; rowOffset += 1) {
          const rowValues = operation.values[rowOffset] ?? [];
          for (let colOffset = 0; colOffset < rowValues.length; colOffset += 1) {
            const targetRow = startRow + rowOffset;
            const targetCol = startCol + colOffset;
            if (targetRow > endRow || targetCol > endCol) {
              continue;
            }
            sheet.getCell(targetRow, targetCol).value = rowValues[colOffset] ?? null;
          }
        }
      }
      applied += 1;
      continue;
    }

    if (operation.op === "insert_rows") {
      const count = operation.count ?? 1;
      const inserts = Array.from({ length: count }, () => []);
      sheet.spliceRows(operation.row, 0, ...inserts);
      applied += 1;
      continue;
    }

    if (operation.op === "delete_rows") {
      const count = operation.count ?? 1;
      sheet.spliceRows(operation.row, count);
      applied += 1;
      continue;
    }

    if (operation.op === "insert_columns") {
      const count = operation.count ?? 1;
      const inserts = Array.from({ length: count }, () => []);
      sheet.spliceColumns(operation.column, 0, ...inserts);
      applied += 1;
      continue;
    }

    if (operation.op === "delete_columns") {
      const count = operation.count ?? 1;
      sheet.spliceColumns(operation.column, count);
      applied += 1;
      continue;
    }

    if (operation.op === "set_column_width") {
      sheet.getColumn(operation.column).width = operation.width;
      applied += 1;
      continue;
    }

    if (operation.op === "merge_cells") {
      sheet.mergeCells(operation.range);
      applied += 1;
      continue;
    }

    if (operation.op === "unmerge_cells") {
      sheet.unMergeCells(operation.range);
      applied += 1;
      continue;
    }

    if (operation.op === "set_cell_style") {
      applyCellStyle(sheet.getCell(operation.cell), operation.style);
      applied += 1;
      continue;
    }

    if (operation.op === "set_range_style") {
      applyStyleToRange(sheet, operation.range, operation.style);
      applied += 1;
    }
  }

  await workbook.xlsx.writeFile(absolutePath);
  return { path: options.path, applied, created };
}
