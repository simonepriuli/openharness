import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStaticSlashMenuItemsCatalog } from "./slash-menu-catalog.js";

describe("buildStaticSlashMenuItemsCatalog", () => {
  it("includes GitHub workflow tools for chat threads but not workflow notify tools", () => {
    const items = buildStaticSlashMenuItemsCatalog();
    assert.ok(items.some((item) => item.toolId === "pr_create"));
    assert.equal(items.some((item) => item.toolId === "teams_notify"), false);
    assert.equal(items.some((item) => item.toolId === "discord_notify"), false);
  });

  it("includes workflow notify tools for workflow instruction editing", () => {
    const items = buildStaticSlashMenuItemsCatalog({ includeWorkflowNotifyTools: true });
    const teamsNotify = items.find((item) => item.toolId === "teams_notify");
    assert.ok(teamsNotify);
    assert.equal(teamsNotify.label, "Post to Teams channel");
    const discordNotify = items.find((item) => item.toolId === "discord_notify");
    assert.ok(discordNotify);
    assert.equal(discordNotify.label, "Post to Discord channel");
  });

  it("lists individual Linear tools instead of grouped entries", () => {
    const items = buildStaticSlashMenuItemsCatalog();
    assert.equal(items.some((item) => item.toolId === "linear_read"), false);
    assert.equal(items.some((item) => item.toolId === "linear_write"), false);
    assert.equal(items.some((item) => item.toolId === "linear_comments"), false);
    const searchIssues = items.find((item) => item.toolId === "search_linear_issues");
    assert.ok(searchIssues);
    assert.equal(searchIssues.label, "Search Linear Issues");
    assert.equal(searchIssues.iconClassName, "tool-icon-linear");
  });
});
