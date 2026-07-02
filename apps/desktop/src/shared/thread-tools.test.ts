import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractToolInvocationsFromText,
  filterSlashMenuItems,
  filterSlashMenuItemsForConversationContext,
  formatToolToken,
  getSlashAtCursor,
  groupSlashMenuItems,
  listSelectableSlashMenuItems,
  mapPiCommandsToSlashMenuItems,
  mergeSlashMenuItems,
  parseMessageParts,
  toolLabelFromId,
} from "./thread-tools.js";

describe("thread-tools", () => {
  it("detects slash query at cursor", () => {
    const range = getSlashAtCursor("please /web", 11);
    assert.deepEqual(range, { query: "web", start: 7, end: 11 });
  });

  it("formats tool and skill tokens", () => {
    assert.equal(formatToolToken("web_search"), "/tool:web_search");
    assert.equal(formatToolToken("skill:review-bugbot"), "/skill:review-bugbot");
  });

  it("filters slash menu items by query", () => {
    const items = filterSlashMenuItems(
      [
        { toolId: "web_search", label: "Web Search", description: "Exa search", section: "tools" },
        { toolId: "skill:review", label: "review", description: "Review skill", section: "skills" },
      ],
      "web",
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]?.toolId, "web_search");
  });

  it("hides GitHub workflow tools in work conversation contexts", () => {
    const items = [
      { toolId: "web_search", label: "Web Search", description: "", section: "tools" as const },
      { toolId: "pr_create", label: "Create Pull Request", description: "", section: "tools" as const },
      {
        toolId: "attach-file-or-folder",
        label: "File or folder…",
        description: "",
        section: "attach" as const,
        action: "attach-file-or-folder" as const,
      },
      { toolId: "skill:review", label: "review", description: "", section: "skills" as const },
    ];
    const coding = filterSlashMenuItemsForConversationContext(items, "coding");
    assert.equal(coding.some((item) => item.toolId === "pr_create"), true);
    assert.equal(coding.some((item) => item.toolId === "attach-file-or-folder"), true);

    const work = filterSlashMenuItemsForConversationContext(items, "work");
    assert.equal(work.some((item) => item.toolId === "pr_create"), false);
    assert.equal(work.some((item) => item.toolId === "web_search"), true);
    assert.equal(work.some((item) => item.toolId === "attach-file-or-folder"), true);
    assert.equal(work.some((item) => item.toolId === "skill:review"), true);

    const workProject = filterSlashMenuItemsForConversationContext(items, "work-project");
    assert.equal(workProject.some((item) => item.toolId === "pr_create"), false);
  });

  it("groups menu items by section", () => {
    const groups = groupSlashMenuItems([
      { toolId: "web_search", label: "Web Search", description: "", section: "tools" },
      { toolId: "skill:review", label: "review", description: "", section: "skills" },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.label, "Tools");
    assert.equal(groups[1]?.label, "Skills");
  });

  it("lists selectable items in grouped display order", () => {
    const items = listSelectableSlashMenuItems(
      [
        { toolId: "web_search", label: "Web Search", description: "", section: "tools" },
        {
          toolId: "attach-file-or-folder",
          label: "File or folder...",
          description: "",
          section: "attach",
          action: "attach-file-or-folder",
        },
        { toolId: "skill:review", label: "review", description: "", section: "skills" },
      ],
      "",
    );
    assert.deepEqual(
      items.map((item) => item.toolId),
      ["attach-file-or-folder", "web_search", "skill:review"],
    );
  });

  it("extracts static tool invocations from text", () => {
    const tools = extractToolInvocationsFromText(
      "Use /tool:web_search and /tool:web_search again, ignore /skill:review",
    );
    assert.equal(tools.length, 1);
    assert.deepEqual(tools[0], { kind: "tool", id: "web_search" });
  });

  it("parses mentions and tool tokens from message text", () => {
    const parts = parseMessageParts("Use /tool:web_search on @src/app.ts please");
    assert.equal(parts.length, 5);
    assert.equal(parts[0]?.type, "text");
    assert.equal(parts[1]?.type, "tool");
    if (parts[1]?.type === "tool") {
      assert.equal(parts[1].toolId, "web_search");
      assert.equal(parts[1].label, toolLabelFromId("web_search"));
    }
    assert.equal(parts[2]?.type, "text");
    assert.equal(parts[3]?.type, "mention");
    if (parts[3]?.type === "mention") {
      assert.equal(parts[3].relativePath, "src/app.ts");
    }
  });
});

describe("slash menu helpers", () => {
  it("maps Pi skill commands to menu items", () => {
    const items = mapPiCommandsToSlashMenuItems([
      {
        name: "skill:review-bugbot",
        description: "Run Bugbot review",
        source: "skill",
        sourceInfo: { path: "/tmp/SKILL.md", baseDir: "/tmp" },
      },
      {
        name: "code-review",
        description: "Prompt template",
        source: "prompt",
      },
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.toolId, "skill:review-bugbot");
    assert.equal(items[0]?.label, "review-bugbot");
    assert.equal(items[0]?.section, "skills");
  });

  it("deduplicates merged menu items by tool id", () => {
    const merged = mergeSlashMenuItems(
      [{ toolId: "web_search", label: "Web Search", description: "", section: "tools" }],
      [{ toolId: "web_search", label: "Duplicate", description: "", section: "tools" }],
    );
    assert.equal(merged.length, 1);
  });
});
