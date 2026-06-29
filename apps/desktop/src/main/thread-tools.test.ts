import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { WORKFLOW_TOOL_CATALOG } from "../shared/workflow-slash-tools.js";
import { THREAD_TOOL_CATALOG } from "../shared/thread-tools.js";
import { draftFromInstructions, serializeDraft } from "../renderer/src/lib/composer-draft.js";
import { expandPromptTools } from "./expand-prompt-tools.js";
import { extractToolInvocationsFromText } from "../shared/thread-tools.js";

describe("expandPromptTools", () => {
  it("prepends web search guidance", () => {
    const expanded = expandPromptTools("Find the latest React docs", [
      { kind: "tool", id: "web_search" },
    ]);
    assert.match(expanded, /web_search/);
    assert.match(expanded, /Find the latest React docs/);
  });

  it("expands skill blocks from disk", () => {
    const skillPath = fileURLToPath(new URL("./thread-tools.test-skill.md", import.meta.url));
    const expanded = expandPromptTools("Review this change", [
      {
        kind: "skill",
        name: "review-bugbot",
        filePath: skillPath,
        baseDir: "/tmp/skills/review-bugbot",
      },
    ]);
    assert.match(expanded, /<skill name="review-bugbot"/);
    assert.match(expanded, /Review this change/);
  });

  it("prepends attached root guidance", () => {
    const expanded = expandPromptTools(
      "Update the budget",
      [],
      [
        {
          id: "g1",
          absolutePath: "/Users/me/Documents/budget.xlsx",
          kind: "file",
          label: "budget.xlsx",
        },
      ],
    );
    assert.match(expanded, /Attached roots/);
    assert.match(expanded, /budget\.xlsx/);
    assert.match(expanded, /Update the budget/);
  });

  it("returns original message when no tools are provided", () => {
    assert.equal(expandPromptTools("Hello", []), "Hello");
  });

  it("expands workflow instructions from serialized tool tokens", () => {
    const instructions = "Review open PRs /tool:web_search";
    const expanded = expandPromptTools(instructions, extractToolInvocationsFromText(instructions));
    assert.match(expanded, /web_search/);
    assert.match(expanded, /Review open PRs/);
  });

  it("expands workflow PR tool guidance", () => {
    const instructions = "Review this PR /tool:pr_comment";
    const expanded = expandPromptTools(instructions, extractToolInvocationsFromText(instructions));
    assert.match(expanded, /submit_pull_request_review/);
    assert.match(expanded, /Review this PR/);
  });
});

describe("buildStaticSlashMenuItemsCatalog", () => {
  it("includes workflow action tools under Tools", () => {
    const items = [
      ...THREAD_TOOL_CATALOG.map((entry) => ({
        toolId: entry.id,
        label: entry.label,
        description: entry.description,
        section: entry.section,
      })),
      ...WORKFLOW_TOOL_CATALOG.map((entry) => ({
        toolId: entry.id,
        label: entry.label,
        description: entry.description,
        section: "tools" as const,
      })),
    ];
    const prCreate = items.find((item) => item.toolId === "pr_create");
    assert.ok(prCreate);
    assert.equal(prCreate.section, "tools");
    assert.equal(prCreate.label, "Create Pull Request");
  });
});

describe("workflow instruction drafts", () => {
  it("round-trips absolute mention paths through draft serialization", () => {
    const serialized = 'Use @"/Users/me/budget.xlsx" please';
    const roundTrip = serializeDraft(draftFromInstructions(serialized));
    assert.equal(roundTrip, serialized);
  });
});
