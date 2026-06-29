import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enabledNotifyToolsFromWorkflowToggles } from "./workflow-notify-mappings.js";

describe("enabledNotifyToolsFromWorkflowToggles", () => {
  it("maps discord and teams toggles to notify tool names", () => {
    assert.deepEqual(
      enabledNotifyToolsFromWorkflowToggles({
        prComment: false,
        prApprove: false,
        prPush: false,
        prCreate: false,
        teamsNotify: true,
        discordNotify: true,
      }),
      ["post_discord_message", "post_teams_message"],
    );
  });

  it("returns empty when no notify toggles are enabled", () => {
    assert.deepEqual(
      enabledNotifyToolsFromWorkflowToggles({
        prComment: true,
        prApprove: false,
        prPush: false,
        prCreate: false,
        teamsNotify: false,
        discordNotify: false,
      }),
      [],
    );
  });
});
