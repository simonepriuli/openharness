import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterAvailableSlashMenuItems,
  isSlashMenuItemAvailable,
  type SlashMenuItem,
  type SlashToolAvailability,
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
    toolId: "teams_notify",
    label: "Post to Teams channel",
    description: "Teams",
    section: "tools",
  },
  {
    toolId: "discord_notify",
    label: "Post to Discord channel",
    description: "Discord",
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

function fullAvailability(overrides: Partial<SlashToolAvailability> = {}): SlashToolAvailability {
  return {
    exaConfigured: true,
    githubActionsReady: true,
    teamsNotifyReady: true,
    discordNotifyReady: true,
    ...overrides,
  };
}

describe("slash-tool-availability", () => {
  it("hides web search when Exa is not configured", () => {
    const availability = fullAvailability({ exaConfigured: false });
    assert.equal(isSlashMenuItemAvailable(sampleItems[0]!, availability), false);
    const filtered = filterAvailableSlashMenuItems(sampleItems, availability);
    assert.equal(filtered.some((item) => item.toolId === "web_search"), false);
    assert.equal(filtered.some((item) => item.toolId === "pr_create"), true);
  });

  it("hides GitHub workflow tools when GitHub actions are not ready", () => {
    const availability = fullAvailability({ githubActionsReady: false });
    const filtered = filterAvailableSlashMenuItems(sampleItems, availability);
    assert.equal(filtered.some((item) => item.toolId === "web_search"), true);
    assert.equal(filtered.some((item) => item.toolId === "pr_create"), false);
    assert.equal(filtered.some((item) => item.toolId === "teams_notify"), true);
    assert.equal(filtered.some((item) => item.toolId === "discord_notify"), true);
  });

  it("hides Teams and Discord notify tools when those integrations are not connected", () => {
    const availability = fullAvailability({ teamsNotifyReady: false, discordNotifyReady: false });
    const filtered = filterAvailableSlashMenuItems(sampleItems, availability);
    assert.equal(filtered.some((item) => item.toolId === "teams_notify"), false);
    assert.equal(filtered.some((item) => item.toolId === "discord_notify"), false);
    assert.equal(filtered.some((item) => item.toolId === "pr_create"), true);
  });

  it("keeps attach actions regardless of integrations", () => {
    const availability = fullAvailability({
      exaConfigured: false,
      githubActionsReady: false,
      teamsNotifyReady: false,
      discordNotifyReady: false,
    });
    const filtered = filterAvailableSlashMenuItems(sampleItems, availability);
    assert.equal(filtered.some((item) => item.toolId === "attach-file-or-folder"), true);
  });
});
