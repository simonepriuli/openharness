import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { editXlsx } from "../../pi-extensions/office-tools/xlsx.js";
import {
  listWorkbookFiles,
  listWorkbookOpenWithApps,
  MAX_WORKBOOK_BYTES,
  readWorkbookFile,
  resolveMacAppBundlePath,
  resolveWorkbookRelativePath,
} from "./workbook-files.js";

let workspaceDir = "";

function resetWorkspace(): void {
  if (workspaceDir && existsSync(workspaceDir)) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
  workspaceDir = mkdtempSync(path.join(tmpdir(), "openharness-workbook-"));
}

beforeEach(() => {
  resetWorkspace();
});

afterEach(() => {
  resetWorkspace();
});

describe("resolveWorkbookRelativePath", () => {
  it("resolves project-relative xlsx paths", () => {
    const filePath = path.join(workspaceDir, "reports", "summary.xlsx");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "placeholder");

    const resolved = resolveWorkbookRelativePath(workspaceDir, "reports/summary.xlsx");
    assert.ok(resolved);
    assert.equal(resolved.relativePath, "reports/summary.xlsx");
    assert.equal(realpathSync(resolved.absolutePath), realpathSync(filePath));
  });

  it("rejects paths outside the workspace", () => {
    const outside = path.join(tmpdir(), `outside-${Date.now()}.xlsx`);
    writeFileSync(outside, "placeholder");
    try {
      const resolved = resolveWorkbookRelativePath(workspaceDir, outside);
      assert.equal(resolved, null);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it("follows cwd symlinks on macOS-style /var paths", () => {
    if (process.platform !== "darwin") return;

    const realWorkspace = path.join(workspaceDir, "real-workspace");
    mkdirSync(realWorkspace, { recursive: true });
    const filePath = path.join(realWorkspace, "linked.xlsx");
    writeFileSync(filePath, "placeholder");

    const symlinkCwd = path.join(workspaceDir, "linked-cwd");
    symlinkSync(realWorkspace, symlinkCwd);

    const resolved = resolveWorkbookRelativePath(symlinkCwd, "linked.xlsx");
    assert.ok(resolved);
    assert.equal(resolved.relativePath, "linked.xlsx");
  });
});

describe("readWorkbookFile", () => {
  it("reads a valid workbook as base64", async () => {
    await editXlsx({
      cwd: workspaceDir,
      path: "budget.xlsx",
      operations: [{ op: "add_sheet", name: "Sheet1" }],
    });

    const result = await readWorkbookFile(workspaceDir, "budget.xlsx");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.relativePath, "budget.xlsx");
    assert.ok(result.mtimeMs > 0);
    const bytes = Buffer.from(result.base64, "base64");
    assert.ok(bytes.length > 0);
    assert.equal(bytes.subarray(0, 2).toString("utf8"), "PK");
  });

  it("rejects workbooks above the preview size cap", async () => {
    const filePath = path.join(workspaceDir, "huge.xlsx");
    writeFileSync(filePath, Buffer.alloc(MAX_WORKBOOK_BYTES + 1, 1));

    const result = await readWorkbookFile(workspaceDir, "huge.xlsx");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "too_large");
  });

  it("returns not_found for missing files", async () => {
    const result = await readWorkbookFile(workspaceDir, "missing.xlsx");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "not_found");
  });
});

describe("listWorkbookFiles", () => {
  it("lists xlsx files recursively under cwd", async () => {
    await editXlsx({
      cwd: workspaceDir,
      path: "root.xlsx",
      operations: [{ op: "add_sheet", name: "Sheet1" }],
    });
    mkdirSync(path.join(workspaceDir, "nested"), { recursive: true });
    await editXlsx({
      cwd: workspaceDir,
      path: "nested/deep.xlsx",
      operations: [{ op: "add_sheet", name: "Sheet1" }],
    });

    const paths = await listWorkbookFiles(workspaceDir);
    assert.deepEqual(paths, ["nested/deep.xlsx", "root.xlsx"]);
  });

  it("returns an empty list for missing cwd", async () => {
    const paths = await listWorkbookFiles(path.join(workspaceDir, "missing"));
    assert.deepEqual(paths, []);
  });
});

describe("readWorkbookFile round trip", () => {
  it("matches the on-disk workbook bytes", async () => {
    await editXlsx({
      cwd: workspaceDir,
      path: "roundtrip.xlsx",
      operations: [{ op: "add_sheet", name: "Sheet1" }],
    });

    const diskBytes = readFileSync(path.join(workspaceDir, "roundtrip.xlsx"));
    const result = await readWorkbookFile(workspaceDir, "roundtrip.xlsx");
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const loadedBytes = Buffer.from(result.base64, "base64");
    assert.equal(loadedBytes.compare(diskBytes), 0);
  });
});

describe("listWorkbookOpenWithApps", () => {
  it("never includes a default app placeholder", async () => {
    const apps = await listWorkbookOpenWithApps();
    assert.ok(apps.every((app) => app.id !== "default"));
  });

  it("returns unique app ids", async () => {
    const apps = await listWorkbookOpenWithApps();
    const ids = apps.map((app) => app.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("resolveMacAppBundlePath", () => {
  it("returns null for missing apps", () => {
    assert.equal(resolveMacAppBundlePath("Definitely Missing Spreadsheet.app"), null);
  });
});
