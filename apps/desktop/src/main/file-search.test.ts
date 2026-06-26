import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { searchFilesAcrossRoots } from "./file-search.js";

describe("searchFilesAcrossRoots", () => {
  it("searches cwd and granted folder roots", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "openharness-search-cwd-"));
    const external = mkdtempSync(join(tmpdir(), "openharness-search-ext-"));
    writeFileSync(join(cwd, "inside.txt"), "hello");
    writeFileSync(join(external, "budget.xlsx"), "xlsx");

    const results = await searchFilesAcrossRoots(
      [
        { cwd },
        {
          cwd,
          grants: [
            {
              id: "g1",
              absolutePath: external,
              kind: "folder",
              label: "External",
            },
          ],
        },
      ],
      "budget",
    );

    assert.ok(results.some((file) => file.relativePath.includes("budget.xlsx")));
    assert.ok(results.some((file) => file.rootLabel === "External" || file.relativePath.includes("External")));
  });
});
