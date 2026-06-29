import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterAvailableSlashMenuItems,
  isSlashMenuItemAvailable,
  type SlashMenuItem,
} from "./thread-tools.js";

const sampleItems: SlashMenuItem[] = [
  {
    toolId: "web_search",
    label: "Web Search",
    description: "Exa",
    section: "tools",
  },
  {
    toolId: "pr_create",
    label: "Create Pull Request",
    description: "Open PR",
    section: "tools",
  },
  {
    toolId: "attach-file-or-folder",
    label: "File or folder…",
    description: "Attach",
    section: "attach",
    action: "attach-file-or-folder",
  },
];

describe("slash-tool-availability", () => {
  it("hides web search when Exa is not configured", () => {
    const availability = { exaConfigured: false, githubActionsReady: true };
    assert.equal(isSlashMenuItemAvailable(sampleItems[0]!, availability), false);
    const filtered = filterAvailableSlashMenuItems(sampleItems, availability);
    assert.equal(filtered.some((item) => item.toolId === "web_search"), false);
    assert.equal(filtered.some((item) => item.toolId === "pr_create"), true);
  });

  it("hides workflow tools when GitHub actions are not ready", () => {
    const availability = { exaConfigured: true, githubActionsReady: false };
    const filtered = filterAvailableSlashMenuItems(sampleItems, availability);
    assert.equal(filtered.some((item) => item.toolId === "web_search"), true);
    assert.equal(filtered.some((item) => item.toolId === "pr_create"), false);
  });

  it("keeps attach actions regardless of integrations", () => {
    const availability = { exaConfigured: false, githubActionsReady: false };
    const filtered = filterAvailableSlashMenuItems(sampleItems, availability);
    assert.equal(filtered.some((item) => item.toolId === "attach-file-or-folder"), true);
  });
});
