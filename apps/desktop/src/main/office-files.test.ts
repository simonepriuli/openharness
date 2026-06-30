import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { editXlsx } from "../../pi-extensions/office-tools/xlsx.js";
import {
  listOfficeFiles,
  listOfficeOpenWithApps,
  MAX_OFFICE_FILE_BYTES,
  readOfficeFile,
  resolveMacAppBundlePath,
  resolveOfficeRelativePath,
} from "./office-files.js";

let workspaceDir = "";

function resetWorkspace(): void {
  if (workspaceDir && existsSync(workspaceDir)) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
  workspaceDir = mkdtempSync(path.join(tmpdir(), "openharness-office-files-"));
}

beforeEach(() => {
  resetWorkspace();
});

afterEach(() => {
  resetWorkspace();
});

describe("resolveOfficeRelativePath", () => {
  it("resolves project-relative xlsx paths", () => {
    const filePath = path.join(workspaceDir, "reports", "summary.xlsx");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "placeholder");

    const resolved = resolveOfficeRelativePath(workspaceDir, "reports/summary.xlsx");
    assert.ok(resolved);
    assert.equal(resolved.kind, "xlsx");
    assert.equal(resolved.relativePath, "reports/summary.xlsx");
    assert.equal(realpathSync(resolved.absolutePath), realpathSync(filePath));
  });

  it("resolves project-relative docx paths", () => {
    const filePath = path.join(workspaceDir, "notes", "memo.docx");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "placeholder");

    const resolved = resolveOfficeRelativePath(workspaceDir, "notes/memo.docx");
    assert.ok(resolved);
    assert.equal(resolved.kind, "docx");
    assert.equal(resolved.relativePath, "notes/memo.docx");
  });
});

describe("readOfficeFile", () => {
  it("reads a valid xlsx workbook as base64", async () => {
    await editXlsx({
      cwd: workspaceDir,
      path: "budget.xlsx",
      operations: [{ op: "add_sheet", name: "Sheet1" }],
    });

    const result = await readOfficeFile(workspaceDir, "budget.xlsx");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.kind, "xlsx");
    const bytes = Buffer.from(result.base64, "base64");
    assert.equal(bytes.subarray(0, 2).toString("utf8"), "PK");
  });

  it("reads a valid docx file as base64", async () => {
    writeFileSync(path.join(workspaceDir, "memo.docx"), Buffer.from("PK", "utf8"));
    const result = await readOfficeFile(workspaceDir, "memo.docx");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.kind, "docx");
  });

  it("rejects files above the preview size cap", async () => {
    writeFileSync(path.join(workspaceDir, "huge.xlsx"), Buffer.alloc(MAX_OFFICE_FILE_BYTES + 1, 1));
    const result = await readOfficeFile(workspaceDir, "huge.xlsx");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "too_large");
  });
});

describe("listOfficeFiles", () => {
  it("lists xlsx and docx files recursively under cwd", async () => {
    await editXlsx({
      cwd: workspaceDir,
      path: "root.xlsx",
      operations: [{ op: "add_sheet", name: "Sheet1" }],
    });
    mkdirSync(path.join(workspaceDir, "nested"), { recursive: true });
    writeFileSync(path.join(workspaceDir, "nested", "notes.docx"), "PK");
    await editXlsx({
      cwd: workspaceDir,
      path: "nested/deep.xlsx",
      operations: [{ op: "add_sheet", name: "Sheet1" }],
    });

    const paths = await listOfficeFiles(workspaceDir);
    assert.deepEqual(paths, ["nested/deep.xlsx", "nested/notes.docx", "root.xlsx"]);
  });
});

describe("listOfficeOpenWithApps", () => {
  it("filters apps by office file kind", async () => {
    const xlsxApps = await listOfficeOpenWithApps("xlsx");
    const docxApps = await listOfficeOpenWithApps("docx");
    assert.ok(xlsxApps.every((app) => app.id !== "microsoft-word"));
    assert.ok(docxApps.every((app) => app.id !== "microsoft-excel"));
  });
});

describe("resolveMacAppBundlePath", () => {
  it("returns null for missing apps", () => {
    assert.equal(resolveMacAppBundlePath("Definitely Missing Spreadsheet.app"), null);
  });
});
