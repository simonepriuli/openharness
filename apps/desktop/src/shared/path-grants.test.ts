import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachedRootLabel,
  dedupeAttachedRoots,
  isPathGranted,
  isPathWithinRoot,
  resolveGrantedPath,
  type AttachedRoot,
} from "./path-grants.js";

describe("path-grants", () => {
  const cwd = "/tmp/work-workspace";
  const grants: AttachedRoot[] = [
    {
      id: "g1",
      absolutePath: "/Users/me/Documents",
      kind: "folder",
      label: "Documents",
    },
    {
      id: "g2",
      absolutePath: "/Users/me/Desktop/budget.xlsx",
      kind: "file",
      label: "budget.xlsx",
    },
  ];

  it("detects nested paths within a folder grant", () => {
    assert.equal(isPathWithinRoot("/Users/me/Documents/reports/q1.xlsx", "/Users/me/Documents"), true);
    assert.equal(isPathWithinRoot("/Users/me/Downloads/file.txt", "/Users/me/Documents"), false);
  });

  it("resolves absolute paths covered by grants", () => {
    const resolved = resolveGrantedPath(cwd, grants, "/Users/me/Desktop/budget.xlsx");
    assert.ok(resolved);
    assert.equal(resolved.absolutePath, "/Users/me/Desktop/budget.xlsx");
    assert.equal(resolved.displayPath, "budget.xlsx");
  });

  it("resolves relative paths inside granted folders", () => {
    const resolved = resolveGrantedPath(cwd, grants, "/Users/me/Documents/reports/q1.xlsx");
    assert.ok(resolved);
    assert.equal(resolved.displayPath, "Documents/reports/q1.xlsx");
  });

  it("rejects paths outside cwd and grants", () => {
    assert.equal(resolveGrantedPath(cwd, grants, "/etc/hosts"), null);
    assert.equal(isPathGranted(cwd, grants, "/etc/hosts"), false);
  });

  it("allows paths under cwd without grants", () => {
    const resolved = resolveGrantedPath(cwd, [], "notes.txt");
    assert.ok(resolved);
    assert.equal(resolved.absolutePath, "/tmp/work-workspace/notes.txt");
  });

  it("dedupes attached roots by absolute path", () => {
    const deduped = dedupeAttachedRoots([
      grants[0]!,
      { ...grants[0]!, id: "dup" },
      grants[1]!,
    ]);
    assert.equal(deduped.length, 2);
  });

  it("derives labels from basename", () => {
    assert.equal(attachedRootLabel("/Users/me/Documents", "folder"), "Documents");
    assert.equal(attachedRootLabel("/Users/me/Desktop/budget.xlsx", "file"), "budget.xlsx");
  });
});
