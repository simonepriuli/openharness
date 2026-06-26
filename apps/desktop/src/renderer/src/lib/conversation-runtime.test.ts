import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  closeWorkbookTabOnRuntime,
  createConversationRuntime,
  extractSheetFromXlsxToolArgs,
  getActiveWorkbookPath,
  getActiveWorkbookSheet,
  MAX_OPEN_WORKBOOK_TABS,
  openWorkbookTabOnRuntime,
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

describe("openWorkbookTabOnRuntime", () => {
  it("normalizes paths and rejects non-xlsx", () => {
    const runtime = makeRuntime();
    assert.equal(openWorkbookTabOnRuntime(runtime, "reports\\budget.xlsx"), true);
    assert.deepEqual(runtime.workbookTabs, {
      openPaths: ["reports/budget.xlsx"],
      activePath: "reports/budget.xlsx",
    });
    assert.equal(openWorkbookTabOnRuntime(runtime, "notes.docx"), false);
  });

  it("focuses an already-open tab", () => {
    const runtime = makeRuntime();
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    openWorkbookTabOnRuntime(runtime, "b.xlsx");
    openWorkbookTabOnRuntime(runtime, "a.xlsx");
    assert.deepEqual(runtime.workbookTabs?.openPaths, ["b.xlsx", "a.xlsx"]);
    assert.equal(runtime.workbookTabs?.activePath, "a.xlsx");
  });

  it("evicts oldest tabs at the limit", () => {
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

describe("setActiveWorkbookTab", () => {
  it("switches active tab without reordering", () => {
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
