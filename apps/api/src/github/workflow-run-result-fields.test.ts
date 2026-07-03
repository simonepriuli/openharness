import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capResultMarkdown, mapRunRowToDetail } from "./workflow-db.js";

describe("capResultMarkdown", () => {
  it("returns undefined when value is omitted", () => {
    assert.equal(capResultMarkdown(undefined), undefined);
  });

  it("returns null for blank strings", () => {
    assert.equal(capResultMarkdown("   "), null);
  });

  it("caps markdown at 64 KiB", () => {
    const long = "a".repeat(70_000);
    const capped = capResultMarkdown(long);
    assert.equal(capped?.length, 65_536);
  });
});

describe("mapRunRowToDetail", () => {
  it("maps result fields for GET /workflow-runs/:id responses", () => {
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    const updatedAt = new Date("2026-06-01T12:05:00.000Z");
    const detail = mapRunRowToDetail({
      id: "run-1",
      workflowId: "wf-1",
      workflowName: "CVE scan",
      event: "schedule",
      provider: "github",
      prNumber: 0,
      status: "done",
      errorMessage: null,
      iteration: 1,
      createdAt,
      updatedAt,
      resultMarkdown: "## Summary\n\nAll clear.",
      resultPayload: {
        kind: "generic",
        summary: "All clear.",
      },
    });

    assert.equal(detail.id, "run-1");
    assert.equal(detail.resultMarkdown, "## Summary\n\nAll clear.");
    assert.equal(detail.resultPayload?.kind, "generic");
    assert.equal(detail.durationMs, 5 * 60_000);
  });

  it("ignores unknown payload kinds", () => {
    const detail = mapRunRowToDetail({
      id: "run-2",
      workflowId: null,
      workflowName: null,
      event: "manual",
      provider: "github",
      prNumber: 0,
      status: "done",
      errorMessage: null,
      iteration: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      resultMarkdown: null,
      resultPayload: { kind: "unknown", summary: "nope" },
    });

    assert.equal(detail.resultPayload, null);
  });
});

describe("workflow run visibility", () => {
  it("documents local-only run visibility for GET /workflow-runs/:id", () => {
    const cases = [
      { localOnly: false, creatorId: "a", viewerId: "b", visible: true },
      { localOnly: true, creatorId: "a", viewerId: "a", visible: true },
      { localOnly: true, creatorId: "a", viewerId: "b", visible: false },
    ] as const;

    for (const row of cases) {
      const visible = !row.localOnly || row.creatorId === row.viewerId;
      assert.equal(visible, row.visible, JSON.stringify(row));
    }
  });
});
