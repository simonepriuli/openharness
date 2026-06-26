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
});

describe("office extension template", () => {
  it("includes a version marker", () => {
    const indexSource = readFileSync(path.join(officeToolsRoot, "index.ts"), "utf8");
    assert.match(indexSource, /openharness-office-tools-version:2/);
  });
});
