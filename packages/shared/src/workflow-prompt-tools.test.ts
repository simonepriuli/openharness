import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendWorkflowNotifyRequirements,
  expandWorkflowInstructions,
} from "./workflow-prompt-tools.js";

describe("appendWorkflowNotifyRequirements", () => {
  it("adds Discord requirements when discordNotify is enabled", () => {
    const result = appendWorkflowNotifyRequirements("Send a joke.", {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: false,
      discordNotify: true,
    });
    assert.match(result, /post_discord_message/);
    assert.match(result, /Send a joke\./);
  });

  it("leaves instructions unchanged when notify toggles are off", () => {
    const result = appendWorkflowNotifyRequirements("Scan the repo.", {
      prComment: false,
      prApprove: false,
      prPush: false,
      prCreate: false,
      teamsNotify: false,
      discordNotify: false,
    });
    assert.equal(result, "Scan the repo.");
  });
});

describe("expandWorkflowInstructions", () => {
  it("expands discord notify tool guidelines from /tool tokens", () => {
    const result = expandWorkflowInstructions("Send a joke. /tool:discord_notify");
    assert.match(result, /post_discord_message/);
    assert.match(result, /Send a joke\./);
  });
});
