import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { backupFile } from "../../pi-extensions/office-tools/backup.js";
import { editDocx, readDocx } from "../../pi-extensions/office-tools/docx.js";
import { resolveOfficePath } from "../../pi-extensions/office-tools/paths.js";
import {
  convertPdfToMd,
  NO_EXTRACTABLE_TEXT_ERROR,
  readPdf,
} from "../../pi-extensions/office-tools/pdf.js";
import { editXlsx, readXlsx } from "../../pi-extensions/office-tools/xlsx.js";

const officeToolsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../pi-extensions/office-tools",
);

let workspaceDir = "";

function resetWorkspace(): void {
  if (workspaceDir && existsSync(workspaceDir)) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
  workspaceDir = mkdtempSync(path.join(tmpdir(), "openharness-office-"));
}

function writeMinimalPdf(filePath: string, pageTexts: string[]): void {
  const objects: string[] = [];
  const addObject = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageObjectIds: number[] = [];

  for (const pageText of pageTexts) {
    const escaped = pageText.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const content = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent PAGES_PLACEHOLDER /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    pageObjectIds.push(pageId);
  }

  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
  const pagesId = addObject(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageObjectIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    let body = objects[index] ?? "";
    if (body.includes("PAGES_PLACEHOLDER")) {
      body = body.replace("PAGES_PLACEHOLDER", `${pagesId} 0 R`);
    }
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    const offset = String(offsets[index] ?? 0).padStart(10, "0");
    pdf += `${offset} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  writeFileSync(filePath, pdf, "utf8");
}

function writeEmptyTextPdf(filePath: string): void {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 8 >>
stream
BT ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
284
%%EOF`;
  writeFileSync(filePath, pdf, "utf8");
}

async function writeMinimalDocx(filePath: string, paragraphs: string[]): Promise<void> {
  const body = paragraphs
    .map(
      (paragraph) =>
        `<w:p><w:r><w:t>${paragraph.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`,
    )
    .join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file("word/document.xml", documentXml);
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );
  const output = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(filePath, output);
}

beforeEach(() => {
  resetWorkspace();
});

afterEach(() => {
  resetWorkspace();
});

describe("office paths", () => {
  it("resolves relative office paths inside cwd", () => {
    const resolved = resolveOfficePath(workspaceDir, "report.docx");
    const expected = path.join(realpathSync(workspaceDir), "report.docx");
    assert.equal(resolved, expected);
  });

  it("resolves relative pdf paths inside cwd", () => {
    const resolved = resolveOfficePath(workspaceDir, "brief.pdf");
    const expected = path.join(realpathSync(workspaceDir), "brief.pdf");
    assert.equal(resolved, expected);
  });

  it("rejects paths outside cwd", () => {
    assert.throws(() => resolveOfficePath(workspaceDir, "../outside.docx"), /not allowed/);
  });
});

describe("office backup", () => {
  it("creates a .bak copy beside the original file", () => {
    const filePath = path.join(workspaceDir, "notes.docx");
    writeFileSync(filePath, "original");
    backupFile(filePath);
    assert.equal(readFileSync(`${filePath}.bak`, "utf8"), "original");
  });
});

describe("xlsx tools", () => {
  it("creates, reads, and edits a spreadsheet", async () => {
    const fileName = "budget.xlsx";
    await editXlsx({
      cwd: workspaceDir,
      path: fileName,
      operations: [
        { op: "add_sheet", name: "Q2" },
        { op: "set_cell", sheet: "Q2", cell: "A1", value: "Revenue" },
        { op: "set_cell", sheet: "Q2", cell: "B1", value: 42000 },
      ],
    });

    const readResult = await readXlsx({ cwd: workspaceDir, path: fileName, sheet: "Q2" });
    assert.equal(readResult.sheet, "Q2");
    assert.equal(readResult.cells[0]?.[0]?.value, "Revenue");
    assert.equal(readResult.cells[0]?.[1]?.value, 42000);

    await editXlsx({
      cwd: workspaceDir,
      path: fileName,
      operations: [{ op: "set_cell", sheet: "Q2", cell: "B1", value: 45000 }],
    });
    assert.ok(existsSync(path.join(workspaceDir, `${fileName}.bak`)));

    const updated = await readXlsx({ cwd: workspaceDir, path: fileName, sheet: "Q2" });
    assert.equal(updated.cells[0]?.[1]?.value, 45000);
  });

  it("supports formulas, sheet ops, structure, and styling", async () => {
    const fileName = "advanced.xlsx";
    await editXlsx({
      cwd: workspaceDir,
      path: fileName,
      operations: [
        { op: "add_sheet", name: "Data" },
        { op: "set_cell", sheet: "Data", cell: "A1", value: 10 },
        { op: "set_cell", sheet: "Data", cell: "A2", value: 20 },
        { op: "set_formula", sheet: "Data", cell: "A3", formula: "SUM(A1:A2)", result: 30 },
        { op: "set_cell_style", sheet: "Data", cell: "A1", style: { bold: true, fillColor: "#FFFF00" } },
        { op: "set_column_width", sheet: "Data", column: 1, width: 24 },
        { op: "merge_cells", sheet: "Data", range: "B1:C1" },
        { op: "set_cell", sheet: "Data", cell: "B1", value: "Merged" },
      ],
    });

    const withFormula = await readXlsx({ cwd: workspaceDir, path: fileName, sheet: "Data" });
    assert.equal(withFormula.cells[2]?.[0]?.formula, "=SUM(A1:A2)");
    assert.equal(withFormula.cells[2]?.[0]?.value, 30);

    await editXlsx({
      cwd: workspaceDir,
      path: fileName,
      operations: [
        { op: "rename_sheet", from: "Data", to: "Metrics" },
        { op: "insert_rows", sheet: "Metrics", row: 2, count: 1 },
        { op: "set_cell", sheet: "Metrics", cell: "A2", value: 5 },
      ],
    });

    const renamed = await readXlsx({ cwd: workspaceDir, path: fileName, sheet: "Metrics" });
    assert.equal(renamed.sheetNames.includes("Metrics"), true);
    assert.equal(renamed.cells[0]?.[0]?.value, 10);
    assert.equal(renamed.cells[1]?.[0]?.value, 5);
    assert.equal(renamed.cells[2]?.[0]?.value, 20);
    assert.equal(renamed.cells[3]?.[0]?.formula, "=SUM(A1:A2)");
  });

  it("clears a range when set_range receives an empty values array", async () => {
    const fileName = "clear-range.xlsx";
    await editXlsx({
      cwd: workspaceDir,
      path: fileName,
      operations: [
        { op: "add_sheet", name: "Sheet1" },
        { op: "set_range", sheet: "Sheet1", range: "A1:B2", values: [["a", "b"], ["c", "d"]] },
      ],
    });

    const before = await readXlsx({ cwd: workspaceDir, path: fileName, sheet: "Sheet1" });
    assert.equal(before.cells[0]?.[0]?.value, "a");
    assert.equal(before.cells[1]?.[1]?.value, "d");

    await editXlsx({
      cwd: workspaceDir,
      path: fileName,
      operations: [{ op: "set_range", sheet: "Sheet1", range: "A1:B2", values: [] }],
    });

    const after = await readXlsx({
      cwd: workspaceDir,
      path: fileName,
      sheet: "Sheet1",
      endRow: 2,
      endCol: 2,
    });
    assert.deepEqual(
      after.cells.flatMap((row) => row.map((cell) => cell.value)),
      [null, null, null, null],
    );
  });
});

describe("docx tools", () => {
  it("reads and edits paragraphs", async () => {
    const fileName = "proposal.docx";
    const absolutePath = path.join(workspaceDir, fileName);
    await writeMinimalDocx(absolutePath, ["Hello ACME team", "Closing paragraph"]);

    const initial = await readDocx({ cwd: workspaceDir, path: fileName });
    assert.equal(initial.totalParagraphs, 2);
    assert.equal(initial.paragraphs[0]?.text, "Hello ACME team");

    await editDocx({
      cwd: workspaceDir,
      path: fileName,
      operations: [{ op: "replace_text", find: "ACME", replace: "Contoso" }],
    });
    assert.ok(existsSync(`${absolutePath}.bak`));

    const updated = await readDocx({ cwd: workspaceDir, path: fileName });
    assert.equal(updated.paragraphs[0]?.text, "Hello Contoso team");
  });

  it("appends a paragraph", async () => {
    const fileName = "memo.docx";
    await writeMinimalDocx(path.join(workspaceDir, fileName), ["Intro"]);

    await editDocx({
      cwd: workspaceDir,
      path: fileName,
      operations: [{ op: "append_paragraph", text: "Added line" }],
    });

    const updated = await readDocx({ cwd: workspaceDir, path: fileName });
    assert.equal(updated.totalParagraphs, 2);
    assert.equal(updated.paragraphs[1]?.text, "Added line");
  });

  it("replaces a paragraph by index", async () => {
    const fileName = "report.docx";
    await writeMinimalDocx(path.join(workspaceDir, fileName), ["First", "Second", "Third"]);

    await editDocx({
      cwd: workspaceDir,
      path: fileName,
      operations: [{ op: "replace_paragraph", paragraphIndex: 1, text: "Updated middle" }],
    });

    const updated = await readDocx({ cwd: workspaceDir, path: fileName });
    assert.equal(updated.paragraphs[1]?.text, "Updated middle");
    assert.equal(updated.paragraphs[0]?.text, "First");
    assert.equal(updated.paragraphs[2]?.text, "Third");
  });
});

describe("pdf tools", () => {
  it("reads extracted text from a PDF", async () => {
    const fileName = "summary.pdf";
    writeMinimalPdf(path.join(workspaceDir, fileName), ["Hello PDF"]);

    const result = await readPdf({ cwd: workspaceDir, path: fileName });
    assert.equal(result.totalPages, 1);
    assert.equal(result.pages[0]?.text, "Hello PDF");
    assert.equal(result.truncated, false);
  });

  it("paginates PDF pages with offset and limit", async () => {
    const fileName = "report.pdf";
    writeMinimalPdf(path.join(workspaceDir, fileName), ["Page one", "Page two", "Page three"]);

    const firstWindow = await readPdf({ cwd: workspaceDir, path: fileName, offset: 1, limit: 2 });
    assert.equal(firstWindow.pages.length, 2);
    assert.equal(firstWindow.pages[0]?.text, "Page one");
    assert.equal(firstWindow.pages[1]?.text, "Page two");
    assert.equal(firstWindow.truncated, true);

    const secondWindow = await readPdf({ cwd: workspaceDir, path: fileName, offset: 3, limit: 2 });
    assert.equal(secondWindow.pages.length, 1);
    assert.equal(secondWindow.pages[0]?.text, "Page three");
    assert.equal(secondWindow.truncated, false);
  });

  it("converts a PDF to markdown beside the source file", async () => {
    const fileName = "export.pdf";
    const absolutePath = path.join(workspaceDir, fileName);
    writeMinimalPdf(absolutePath, ["Export me"]);

    const result = await convertPdfToMd({ cwd: workspaceDir, path: fileName });
    assert.equal(result.outputPath, "export.md");
    assert.match(readFileSync(path.join(workspaceDir, "export.md"), "utf8"), /Export me/);
  });

  it("rejects PDFs with no extractable text", async () => {
    const fileName = "scanned.pdf";
    writeEmptyTextPdf(path.join(workspaceDir, fileName));

    await assert.rejects(
      () => readPdf({ cwd: workspaceDir, path: fileName }),
      new RegExp(NO_EXTRACTABLE_TEXT_ERROR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });
});

describe("office extension template", () => {
  it("includes a version marker", () => {
    const indexSource = readFileSync(path.join(officeToolsRoot, "index.ts"), "utf8");
    assert.match(indexSource, /openharness-office-tools-version:6/);
  });

  it("registers office tools in all conversation contexts", () => {
    const indexSource = readFileSync(path.join(officeToolsRoot, "index.ts"), "utf8");
    assert.doesNotMatch(indexSource, /if \(!isWorkMode\(\)\) \{\s*return;\s*\}/);
    assert.match(indexSource, /OFFICE_TOOLS_PROMPT_APPEND/);
    assert.match(indexSource, /name: "read_xlsx"/);
    assert.match(indexSource, /pi\.on\("before_agent_start"/);
  });
});
