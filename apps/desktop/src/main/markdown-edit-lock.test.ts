import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  clearMarkdownEditLocks,
  getMarkdownEditLocks,
  getMarkdownLocksFileForSession,
  isMarkdownPathLocked,
  setMarkdownEditLock,
} from "./markdown-edit-lock.js";
import { writeProjectFile } from "./project-file-write.js";

describe("markdown edit lock registry", () => {
  it("tracks locked paths per session", () => {
    const sessionKey = "/tmp/work::draft::abc";
    setMarkdownEditLock(sessionKey, "notes/report.md", true);
    assert.deepEqual(getMarkdownEditLocks(sessionKey), ["notes/report.md"]);
    assert.equal(isMarkdownPathLocked(sessionKey, "notes/report.md"), true);
    setMarkdownEditLock(sessionKey, "notes/report.md", false);
    assert.deepEqual(getMarkdownEditLocks(sessionKey), []);
    clearMarkdownEditLocks(sessionKey);
  });

  it("writes lock state to a stable session file", async () => {
    const sessionKey = "/tmp/work::draft::file-test";
    setMarkdownEditLock(sessionKey, "draft.md", true);
    const lockFile = getMarkdownLocksFileForSession(sessionKey);
    const raw = await readFile(lockFile, "utf8");
    const parsed = JSON.parse(raw) as { lockedPaths: string[] };
    assert.deepEqual(parsed.lockedPaths, ["draft.md"]);
    clearMarkdownEditLocks(sessionKey);
  });
});

describe("writeProjectFile", () => {
  it("writes utf8 text within the workspace", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "openharness-write-"));
    try {
      const result = await writeProjectFile(workspaceDir, "notes/draft.md", "# Hello");
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const contents = await readFile(join(workspaceDir, "notes/draft.md"), "utf8");
      assert.equal(contents, "# Hello");
      assert.ok(result.mtimeMs > 0);
    } finally {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("rejects writes outside the workspace", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "openharness-write-out-"));
    try {
      const result = await writeProjectFile(workspaceDir, "../escape.md", "nope");
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.error, "outside_project");
    } finally {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("rejects content above the size cap", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "openharness-write-large-"));
    try {
      const huge = "x".repeat(512 * 1024 + 1);
      const result = await writeProjectFile(workspaceDir, "huge.md", huge);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.error, "too_large");
    } finally {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });
});
