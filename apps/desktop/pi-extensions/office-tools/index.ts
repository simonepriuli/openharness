// openharness-office-tools-version:6
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { editDocx, readDocx } from "./docx.js";
import {
  isMarkdownPathLocked,
  isMarkdownExtension,
  markdownPathFromToolInput,
} from "./markdown-locks.js";
import { isOfficeExtension, isPdfExtension, resolveOfficePath } from "./paths.js";
import { convertPdfToMd, readPdf } from "./pdf.js";
import { editXlsx, readXlsx } from "./xlsx.js";

const OFFICE_TOOLS_PROMPT_APPEND = String.raw`
OpenHarness office file tools:
- For .docx and .xlsx files, use read_docx/read_xlsx and edit_docx/edit_xlsx — never raw read/edit/write on Office files.
- For .pdf files, use read_pdf — never raw read/edit/write on PDFs.
- Use convert_pdf_to_md only when the user explicitly asks to export a PDF to markdown.
- When the user has the document panel open, edits to .docx and .xlsx files appear in the in-app document preview automatically.
- Markdown (.md) files open in the in-app markdown editor when read or edited. The user may be typing in the panel — if edit/write is blocked, wait and retry; changes appear live when the panel is idle.
- Read Office files in chunks (paragraph windows for Word, row/column ranges for Excel) when documents may be large.
`;

const ReadXlsxParams = Type.Object({
  path: Type.String({ description: "Path to the .xlsx file (relative to cwd)" }),
  sheet: Type.Optional(Type.String({ description: "Worksheet name (defaults to first sheet)" })),
  startRow: Type.Optional(Type.Integer({ minimum: 1, description: "First row to read (1-based)" })),
  endRow: Type.Optional(Type.Integer({ minimum: 1, description: "Last row to read (1-based)" })),
  startCol: Type.Optional(Type.Integer({ minimum: 1, description: "First column to read (1-based)" })),
  endCol: Type.Optional(Type.Integer({ minimum: 1, description: "Last column to read (1-based)" })),
});

const SetCellOp = Type.Object({
  op: Type.Literal("set_cell"),
  sheet: Type.Optional(Type.String()),
  cell: Type.String({ description: "Cell reference, e.g. A1" }),
  value: Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]),
});

const SetRangeOp = Type.Object({
  op: Type.Literal("set_range"),
  sheet: Type.Optional(Type.String()),
  range: Type.String({ description: "Range reference, e.g. A1:C3" }),
  values: Type.Array(Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()])), {
    description: "2D values aligned with range top-left; use [] to clear every cell in the range, or null entries to clear individual cells",
  }),
});

const SetFormulaOp = Type.Object({
  op: Type.Literal("set_formula"),
  sheet: Type.Optional(Type.String()),
  cell: Type.String({ description: "Cell reference, e.g. B10" }),
  formula: Type.String({ description: "Formula text, e.g. SUM(A1:A9) or =SUM(A1:A9)" }),
  result: Type.Optional(
    Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()], {
      description: "Optional cached result shown by read_xlsx before Excel recalculates",
    }),
  ),
});

const AddSheetOp = Type.Object({
  op: Type.Literal("add_sheet"),
  name: Type.String(),
});

const RenameSheetOp = Type.Object({
  op: Type.Literal("rename_sheet"),
  from: Type.String(),
  to: Type.String(),
});

const DeleteSheetOp = Type.Object({
  op: Type.Literal("delete_sheet"),
  sheet: Type.String(),
});

const InsertRowsOp = Type.Object({
  op: Type.Literal("insert_rows"),
  sheet: Type.Optional(Type.String()),
  row: Type.Integer({ minimum: 1, description: "Row index to insert before (1-based)" }),
  count: Type.Optional(Type.Integer({ minimum: 1 })),
});

const DeleteRowsOp = Type.Object({
  op: Type.Literal("delete_rows"),
  sheet: Type.Optional(Type.String()),
  row: Type.Integer({ minimum: 1, description: "First row to delete (1-based)" }),
  count: Type.Optional(Type.Integer({ minimum: 1 })),
});

const InsertColumnsOp = Type.Object({
  op: Type.Literal("insert_columns"),
  sheet: Type.Optional(Type.String()),
  column: Type.Integer({ minimum: 1, description: "Column index to insert before (1-based)" }),
  count: Type.Optional(Type.Integer({ minimum: 1 })),
});

const DeleteColumnsOp = Type.Object({
  op: Type.Literal("delete_columns"),
  sheet: Type.Optional(Type.String()),
  column: Type.Integer({ minimum: 1, description: "First column to delete (1-based)" }),
  count: Type.Optional(Type.Integer({ minimum: 1 })),
});

const SetColumnWidthOp = Type.Object({
  op: Type.Literal("set_column_width"),
  sheet: Type.Optional(Type.String()),
  column: Type.Integer({ minimum: 1 }),
  width: Type.Number({ minimum: 0 }),
});

const MergeCellsOp = Type.Object({
  op: Type.Literal("merge_cells"),
  sheet: Type.Optional(Type.String()),
  range: Type.String({ description: "Range to merge, e.g. A1:C1" }),
});

const UnmergeCellsOp = Type.Object({
  op: Type.Literal("unmerge_cells"),
  sheet: Type.Optional(Type.String()),
  range: Type.String({ description: "Range to unmerge, e.g. A1:C1" }),
});

const CellBorderStyle = Type.Object({
  top: Type.Optional(Type.Boolean()),
  bottom: Type.Optional(Type.Boolean()),
  left: Type.Optional(Type.Boolean()),
  right: Type.Optional(Type.Boolean()),
  color: Type.Optional(Type.String({ description: "Hex color, e.g. #000000 or FF000000" })),
  style: Type.Optional(Type.Union([Type.Literal("thin"), Type.Literal("medium"), Type.Literal("thick")])),
});

const CellStyle = Type.Object({
  bold: Type.Optional(Type.Boolean()),
  italic: Type.Optional(Type.Boolean()),
  underline: Type.Optional(Type.Boolean()),
  strike: Type.Optional(Type.Boolean()),
  fontColor: Type.Optional(Type.String({ description: "Hex color, e.g. #FF0000" })),
  fillColor: Type.Optional(Type.String({ description: "Hex background color, e.g. #FFFF00" })),
  numFmt: Type.Optional(Type.String({ description: "Excel number format, e.g. $#,##0.00 or 0.00%" })),
  border: Type.Optional(CellBorderStyle),
});

const SetCellStyleOp = Type.Object({
  op: Type.Literal("set_cell_style"),
  sheet: Type.Optional(Type.String()),
  cell: Type.String(),
  style: CellStyle,
});

const SetRangeStyleOp = Type.Object({
  op: Type.Literal("set_range_style"),
  sheet: Type.Optional(Type.String()),
  range: Type.String(),
  style: CellStyle,
});

const EditXlsxParams = Type.Object({
  path: Type.String({ description: "Path to the .xlsx file (relative to cwd)" }),
  operations: Type.Array(
    Type.Union([
      SetCellOp,
      SetRangeOp,
      SetFormulaOp,
      AddSheetOp,
      RenameSheetOp,
      DeleteSheetOp,
      InsertRowsOp,
      DeleteRowsOp,
      InsertColumnsOp,
      DeleteColumnsOp,
      SetColumnWidthOp,
      MergeCellsOp,
      UnmergeCellsOp,
      SetCellStyleOp,
      SetRangeStyleOp,
    ]),
    { minItems: 1 },
  ),
});

const ReadDocxParams = Type.Object({
  path: Type.String({ description: "Path to the .docx file (relative to cwd)" }),
  offset: Type.Optional(Type.Integer({ minimum: 0, description: "Paragraph index to start reading" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum paragraphs to return" })),
});

const ReplaceTextOp = Type.Object({
  op: Type.Literal("replace_text"),
  find: Type.String(),
  replace: Type.String(),
  matchCase: Type.Optional(Type.Boolean()),
});

const InsertParagraphOp = Type.Object({
  op: Type.Literal("insert_paragraph_after"),
  anchorText: Type.Optional(Type.String()),
  paragraphIndex: Type.Optional(Type.Integer({ minimum: 0 })),
  text: Type.String(),
});

const DeleteParagraphOp = Type.Object({
  op: Type.Literal("delete_paragraph"),
  paragraphIndex: Type.Integer({ minimum: 0 }),
});

const AppendParagraphOp = Type.Object({
  op: Type.Literal("append_paragraph"),
  text: Type.String(),
});

const ReplaceParagraphOp = Type.Object({
  op: Type.Literal("replace_paragraph"),
  paragraphIndex: Type.Integer({ minimum: 0 }),
  text: Type.String(),
});

const EditDocxParams = Type.Object({
  path: Type.String({ description: "Path to the .docx file (relative to cwd)" }),
  operations: Type.Array(
    Type.Union([
      ReplaceTextOp,
      ReplaceParagraphOp,
      InsertParagraphOp,
      DeleteParagraphOp,
      AppendParagraphOp,
    ]),
    { minItems: 1 },
  ),
});

const ReadPdfParams = Type.Object({
  path: Type.String({ description: "Path to the .pdf file (relative to cwd)" }),
  offset: Type.Optional(Type.Integer({ minimum: 1, description: "First page to read (1-based)" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum pages to return" })),
});

const ConvertPdfToMdParams = Type.Object({
  path: Type.String({ description: "Path to the .pdf file (relative to cwd)" }),
});

function formatCellForDisplay(cell: { value: string | number | boolean | null; formula?: string }): string {
  if (cell.formula) {
    return `${cell.formula} -> ${JSON.stringify(cell.value)}`;
  }
  return JSON.stringify(cell.value);
}

function formatReadXlsx(result: Awaited<ReturnType<typeof readXlsx>>): string {
  const lines = [
    `Workbook: ${result.path}`,
    `Sheets: ${result.sheetNames.join(", ")}`,
    `Active sheet: ${result.sheet}`,
    `Range: rows ${result.startRow}-${result.endRow}, cols ${result.startCol}-${result.endCol}`,
    `Total size: ${result.totalRows} rows x ${result.totalCols} cols`,
  ];
  if (result.truncated) {
    lines.push("Note: output truncated — call read_xlsx again with a different row/col window.");
  }
  lines.push("");
  for (let row = 0; row < result.cells.length; row += 1) {
    const rowNumber = result.startRow + row;
    const cells = (result.cells[row] ?? []).map((cell) => formatCellForDisplay(cell)).join("\t");
    lines.push(`R${rowNumber}: ${cells}`);
  }
  return lines.join("\n");
}

function formatReadDocx(result: Awaited<ReturnType<typeof readDocx>>): string {
  const lines = [
    `Document: ${result.path}`,
    `Paragraphs: showing ${result.offset}-${result.offset + result.paragraphs.length - 1} of ${result.totalParagraphs}`,
  ];
  if (result.truncated) {
    lines.push("Note: output truncated — call read_docx again with a higher offset.");
  }
  if (result.outline.length > 0) {
    lines.push("", "Outline:");
    for (const entry of result.outline) {
      lines.push(`- [${entry.index}] ${entry.text}`);
    }
  }
  lines.push("", "Paragraphs:");
  for (const paragraph of result.paragraphs) {
    lines.push(`[${paragraph.index}] ${paragraph.text}`);
  }
  return lines.join("\n");
}

function formatReadPdf(result: Awaited<ReturnType<typeof readPdf>>): string {
  const lines = [
    `PDF: ${result.path}`,
    `Pages: showing ${result.offset}-${result.offset + result.pages.length - 1} of ${result.totalPages}`,
  ];
  if (result.truncated) {
    lines.push("Note: output truncated — call read_pdf again with a higher offset.");
  }
  lines.push("", "Pages:");
  for (const page of result.pages) {
    lines.push(`[${page.page}] ${page.text}`);
  }
  return lines.join("\n");
}

function officePathFromToolInput(cwd: string, input: unknown): string | undefined {
  const record = input as { path?: string; file_path?: string };
  const raw = String(record.path ?? record.file_path ?? "").trim();
  if (!raw) return undefined;
  try {
    return resolveOfficePath(cwd, raw);
  } catch {
    const lower = raw.toLowerCase();
    if (lower.endsWith(".docx") || lower.endsWith(".xlsx") || lower.endsWith(".pdf")) {
      return raw;
    }
    return undefined;
  }
}

function pdfPathFromToolInput(cwd: string, input: unknown): string | undefined {
  const record = input as { path?: string; file_path?: string };
  const raw = String(record.path ?? record.file_path ?? "").trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (!lower.endsWith(".pdf")) return undefined;
  try {
    return resolveOfficePath(cwd, raw);
  } catch {
    return raw;
  }
}

export default function openharnessOfficeTools(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: event.systemPrompt + OFFICE_TOOLS_PROMPT_APPEND,
  }));

  pi.registerTool({
    name: "read_xlsx",
    label: "Read Excel",
    description: "Read a paginated slice of an .xlsx spreadsheet with cell values and formulas.",
    promptSnippet: "read_xlsx(path, sheet?, startRow?, endRow?, startCol?, endCol?)",
    promptGuidelines: [
      "Use read_xlsx instead of read for .xlsx files.",
      "Read in chunks for large spreadsheets; default window is about 100 rows by 20 columns.",
      "Cells with formulas return both formula text and computed value.",
      "Inspect sheet names first, then read the relevant range before editing.",
    ],
    parameters: ReadXlsxParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await readXlsx({
          cwd: ctx.cwd,
          path: params.path,
          sheet: params.sheet,
          startRow: params.startRow,
          endRow: params.endRow,
          startCol: params.startCol,
          endCol: params.endCol,
        });
        return {
          content: [{ type: "text", text: formatReadXlsx(result) }],
          details: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
          details: {},
        };
      }
    },
  });

  pi.registerTool({
    name: "edit_xlsx",
    label: "Edit Excel",
    description:
      "Apply structured patch operations to an .xlsx workbook: values, formulas, sheets, rows/columns, widths, merges, and basic formatting.",
    promptSnippet: "edit_xlsx(path, operations[])",
    promptGuidelines: [
      "Use edit_xlsx instead of edit or write for .xlsx files.",
      "Prefer read_xlsx first to confirm sheet names and cell addresses.",
      "Value ops: set_cell, set_range (values: [] clears the whole range), set_formula (optional cached result). Sheet ops: add_sheet, rename_sheet, delete_sheet.",
      "Structure ops: insert_rows, delete_rows, insert_columns, delete_columns, merge_cells, unmerge_cells, set_column_width.",
      "Style ops: set_cell_style, set_range_style (bold, colors, borders, numFmt).",
      "A .bak backup is written before edits to existing files.",
    ],
    parameters: EditXlsxParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await editXlsx({
          cwd: ctx.cwd,
          path: params.path,
          operations: params.operations as Parameters<typeof editXlsx>[0]["operations"],
        });
        const verb = result.created ? "Created" : "Updated";
        return {
          content: [
            {
              type: "text",
              text: `${verb} ${result.path} (${result.applied} operation${result.applied === 1 ? "" : "s"} applied). Backup: ${result.path}.bak when file existed.`,
            },
          ],
          details: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
          details: {},
        };
      }
    },
  });

  pi.registerTool({
    name: "read_docx",
    label: "Read Word",
    description: "Read numbered paragraphs from a .docx file with optional heading outline.",
    promptSnippet: "read_docx(path, offset?, limit?)",
    promptGuidelines: [
      "Use read_docx instead of read for .docx files.",
      "Read in chunks for long documents; default limit is 50 paragraphs.",
      "Use paragraph indices from read_docx when calling edit_docx.",
    ],
    parameters: ReadDocxParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await readDocx({
          cwd: ctx.cwd,
          path: params.path,
          offset: params.offset,
          limit: params.limit,
        });
        return {
          content: [{ type: "text", text: formatReadDocx(result) }],
          details: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
          details: {},
        };
      }
    },
  });

  pi.registerTool({
    name: "edit_docx",
    label: "Edit Word",
    description: "Apply structured patch operations to an existing .docx file.",
    promptSnippet: "edit_docx(path, operations[])",
    promptGuidelines: [
      "Use edit_docx instead of edit or write for .docx files.",
      "Operations: replace_text, replace_paragraph, insert_paragraph_after, delete_paragraph, append_paragraph.",
      "Prefer replace_paragraph with paragraph indices from read_docx over fragile replace_text.",
      "A .bak backup is written before edits. Formatting outside edited text is preserved when possible.",
    ],
    parameters: EditDocxParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await editDocx({
          cwd: ctx.cwd,
          path: params.path,
          operations: params.operations as Parameters<typeof editDocx>[0]["operations"],
        });
        return {
          content: [
            {
              type: "text",
              text: `Updated ${result.path} (${result.applied} operation${result.applied === 1 ? "" : "s"} applied). Backup: ${result.path}.bak`,
            },
          ],
          details: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
          details: {},
        };
      }
    },
  });

  pi.registerTool({
    name: "read_pdf",
    label: "Read PDF",
    description: "Read paginated text extracted from a .pdf file.",
    promptSnippet: "read_pdf(path, offset?, limit?)",
    promptGuidelines: [
      "Use read_pdf instead of read for .pdf files.",
      "Read in page chunks for large documents; default limit is 5 pages.",
      "Use page numbers from read_pdf when discussing specific sections.",
    ],
    parameters: ReadPdfParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await readPdf({
          cwd: ctx.cwd,
          path: params.path,
          offset: params.offset,
          limit: params.limit,
        });
        return {
          content: [{ type: "text", text: formatReadPdf(result) }],
          details: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
          details: {},
        };
      }
    },
  });

  pi.registerTool({
    name: "convert_pdf_to_md",
    label: "Convert PDF to Markdown",
    description: "Export a .pdf file to markdown beside the source file (report.pdf -> report.md).",
    promptSnippet: "convert_pdf_to_md(path)",
    promptGuidelines: [
      "Use convert_pdf_to_md only when the user explicitly asks to convert, export, or save a PDF as markdown.",
      "Do not convert PDFs automatically after reading them.",
      "The markdown file is written next to the PDF in the same directory.",
    ],
    parameters: ConvertPdfToMdParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await convertPdfToMd({
          cwd: ctx.cwd,
          path: params.path,
        });
        return {
          content: [
            {
              type: "text",
              text: `Converted ${result.path} to ${result.outputPath} (${result.pageCount} page${result.pageCount === 1 ? "" : "s"}, ${result.charCount} characters).`,
            },
          ],
          details: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
          details: {},
        };
      }
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "read") {
      const target = pdfPathFromToolInput(ctx.cwd, event.input);
      if (!target || !isPdfExtension(target)) return;
      return {
        block: true,
        reason: "Use read_pdf for PDF files. Raw read cannot parse binary PDF content.",
      };
    }
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    const markdownPath = markdownPathFromToolInput(ctx.cwd, event.input);
    if (markdownPath && isMarkdownPathLocked(ctx.cwd, markdownPath)) {
      return {
        block: true,
        reason:
          "This markdown file is being edited in the panel. Wait a moment and retry when the user is done typing.",
      };
    }
    const target = officePathFromToolInput(ctx.cwd, event.input);
    if (!target || !isOfficeExtension(target)) return;
    if (isMarkdownExtension(target)) return;
    return {
      block: true,
      reason: "Use edit_docx or edit_xlsx for Office files (.docx / .xlsx). Raw edit/write corrupts binary documents.",
    };
  });
}
