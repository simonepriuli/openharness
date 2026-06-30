import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  closeWorkbookTabOnRuntime,
  createConversationRuntime,
  extractSheetFromXlsxToolArgs,
  getActiveOfficeFileKind,
  getActiveOfficePath,
  getActiveWorkbookPath,
  getActiveWorkbookSheet,
  MAX_OPEN_OFFICE_TABS,
  MAX_OPEN_WORKBOOK_TABS,
  openOfficeTabOnRuntime,
  openWorkbookTabOnRuntime,
  setActiveOfficeTab,
  setActiveWorkbookSheetOnRuntime,
  setActiveWorkbookTab,
} from "./conversation-runtime.js";

function makeRuntime() {
  return createConversationRuntime({
    conversationId: "test-id",
    sessionKey: "/tmp::draft::test-id",
    cwd: "/tmp",
  });
}

describe("openOfficeTabOnRuntime", () => {
  it("normalizes paths and accepts docx, xlsx, and md", () => {
    const runtime = makeRuntime();
    assert.equal(openOfficeTabOnRuntime(runtime, "reports\\budget.xlsx"), true);
    assert.deepEqual(runtime.workbookTabs, {
      openPaths: ["reports/budget.xlsx"],
      activePath: "reports/budget.xlsx",
    });
    assert.equal(openOfficeTabOnRuntime(runtime, "notes.docx"), true);
    assert.equal(getActiveOfficeFileKind(runtime), "docx");
    assert.equal(openOfficeTabOnRuntime(runtime, "memo.md"), true);
    assert.equal(getActiveOfficeFileKind(runtime), "md");
  });

  it("rejects non-office files", () => {
    const runtime = makeRuntime();
    assert.equal(openOfficeTabOnRuntime(runtime, "readme.txt"), false);
  });

  it("focuses an already-open tab", () => {
    const runtime = makeRuntime();
    openOfficeTabOnRuntime(runtime, "a.xlsx");
    openOfficeTabOnRuntime(runtime, "b.docx");
    openOfficeTabOnRuntime(runtime, "a.xlsx");
    assert.deepEqual(runtime.workbookTabs?.openPaths, ["b.docx", "a.xlsx"]);
    assert.equal(runtime.workbookTabs?.activePath, "a.xlsx");
  });

  it("evicts oldest tabs at the limit", () => {
    const runtime = makeRuntime();
    for (let index = 0; index < MAX_OPEN_OFFICE_TABS + 2; index += 1) {
      openOfficeTabOnRuntime(runtime, `file-${index}.docx`);
    }
    assert.equal(runtime.workbookTabs?.openPaths.length, MAX_OPEN_OFFICE_TABS);
    assert.deepEqual(runtime.workbookTabs?.openPaths[0], "file-2.docx");
    assert.equal(runtime.workbookTabs?.activePath, `file-${MAX_OPEN_OFFICE_TABS + 1}.docx`);
  });
});

describe("openWorkbookTabOnRuntime", () => {
  it("still rejects non-xlsx paths", () => {
    const runtime = makeRuntime();
    assert.equal(openWorkbookTabOnRuntime(runtime, "notes.docx"), false);
  });
});

describe("openWorkbookTabOnRuntime xlsx", () => {
  it("focuses an already-open xlsx tab", () => {
    const runtime = makeRuntime();
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    openWorkbookTabOnRuntime(runtime, "b.xlsx");
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    assert.deepEqual(runtime.workbookTabs?.openPaths, ["b.xlsx", "a.xlsx"]);
    assert.equal(runtime.workbookTabs?.activePath, "a.xlsx");
  });

  it("evicts oldest xlsx tabs at the limit", () => {
    const runtime = makeRuntime();
    for (let index = 0; index < MAX_OPEN_WORKBOOK_TABS + 2; index += 1) {
      openWorkbookTabOnRuntime(runtime, `file-${index}.xlsx`);
    }
    assert.equal(runtime.workbookTabs?.openPaths.length, MAX_OPEN_WORKBOOK_TABS);
    assert.deepEqual(runtime.workbookTabs?.openPaths[0], "file-2.xlsx");
    assert.equal(runtime.workbookTabs?.activePath, `file-${MAX_OPEN_WORKBOOK_TABS + 1}.xlsx`);
  });
});

describe("closeWorkbookTabOnRuntime", () => {
  it("removes a tab and falls back to the last open tab", () => {
    const runtime = makeRuntime();
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    openWorkbookTabOnRuntime(runtime, "b.xlsx");
    assert.equal(closeWorkbookTabOnRuntime(runtime, "b.xlsx"), true);
    assert.deepEqual(runtime.workbookTabs, {
      openPaths: ["a.xlsx"],
      activePath: "a.xlsx",
    });
  });

  it("clears workbook tabs when the last tab closes", () => {
    const runtime = makeRuntime();
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    assert.equal(closeWorkbookTabOnRuntime(runtime, "a.xlsx"), true);
    assert.equal(runtime.workbookTabs, undefined);
  });
});

describe("setActiveOfficeTab", () => {
  it("switches active tab without reordering", () => {
    const runtime = makeRuntime();
    openOfficeTabOnRuntime(runtime, "a.xlsx");
    openOfficeTabOnRuntime(runtime, "b.docx");
    assert.equal(setActiveOfficeTab(runtime, "a.xlsx"), true);
    assert.deepEqual(runtime.workbookTabs?.openPaths, ["a.xlsx", "b.docx"]);
    assert.equal(getActiveOfficePath(runtime), "a.xlsx");
    assert.equal(getActiveWorkbookPath(runtime), "a.xlsx");
  });
});

describe("setActiveWorkbookTab", () => {
  it("switches active xlsx tab without reordering", () => {
    const runtime = makeRuntime();
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    openWorkbookTabOnRuntime(runtime, "b.xlsx");
    assert.equal(setActiveWorkbookTab(runtime, "a.xlsx"), true);
    assert.deepEqual(runtime.workbookTabs?.openPaths, ["a.xlsx", "b.xlsx"]);
    assert.equal(getActiveWorkbookPath(runtime), "a.xlsx");
  });
});

describe("workbook sheet persistence", () => {
  it("stores and resolves active sheet per workbook path", () => {
    const runtime = makeRuntime();
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    openWorkbookTabOnRuntime(runtime, "b.xlsx");

    assert.equal(setActiveWorkbookSheetOnRuntime(runtime, "a.xlsx", "Summary"), true);
    assert.equal(setActiveWorkbookSheetOnRuntime(runtime, "b.xlsx", "Budget"), true);
    assert.equal(getActiveWorkbookSheet(runtime, "a.xlsx"), "Summary");
    assert.equal(getActiveWorkbookSheet(runtime, "b.xlsx"), "Budget");

    setActiveWorkbookTab(runtime, "a.xlsx");
    assert.equal(getActiveWorkbookSheet(runtime), "Summary");
  });

  it("clears stored sheet when a workbook tab closes", () => {
    const runtime = makeRuntime();
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    setActiveWorkbookSheetOnRuntime(runtime, "a.xlsx", "Summary");
    assert.equal(closeWorkbookTabOnRuntime(runtime, "a.xlsx"), true);
    assert.equal(runtime.workbookTabs, undefined);
  });

  it("ignores duplicate sheet updates", () => {
    const runtime = makeRuntime();
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    assert.equal(setActiveWorkbookSheetOnRuntime(runtime, "a.xlsx", "Summary"), true);
    assert.equal(setActiveWorkbookSheetOnRuntime(runtime, "a.xlsx", "Summary"), false);
  });
});

describe("extractSheetFromXlsxToolArgs", () => {
  it("reads sheet from read_xlsx args", () => {
    assert.equal(
      extractSheetFromXlsxToolArgs("read_xlsx", { path: "a.xlsx", sheet: "Budget" }),
      "Budget",
    );
    assert.equal(extractSheetFromXlsxToolArgs("read_xlsx", { path: "a.xlsx" }), undefined);
  });

  it("prioritizes structural edit_xlsx operations", () => {
    assert.equal(
      extractSheetFromXlsxToolArgs("edit_xlsx", {
        path: "a.xlsx",
        operations: [
          { op: "set_cell", sheet: "Old", cell: "A1", value: 1 },
          { op: "add_sheet", name: "New" },
        ],
      }),
      "New",
    );
    assert.equal(
      extractSheetFromXlsxToolArgs("edit_xlsx", {
        path: "a.xlsx",
        operations: [{ op: "rename_sheet", from: "Old", to: "Renamed" }],
      }),
      "Renamed",
    );
    assert.equal(
      extractSheetFromXlsxToolArgs("edit_xlsx", {
        path: "a.xlsx",
        operations: [{ op: "delete_sheet", sheet: "Gone" }],
      }),
      "Gone",
    );
  });

  it("falls back to the first sheet-bearing edit_xlsx operation", () => {
    assert.equal(
      extractSheetFromXlsxToolArgs("edit_xlsx", {
        path: "a.xlsx",
        operations: [{ op: "set_cell", sheet: "Budget", cell: "A1", value: 1 }],
      }),
      "Budget",
    );
  });
});
