import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LINEAR_AGENT_BEHAVIOR_GUIDELINES,
  LINEAR_AGENT_DEFAULT_INSTRUCTIONS,
  buildLinearAgentPrompt,
} from "./linear-agent-prompts.js";

describe("buildLinearAgentPrompt", () => {
  const baseRun = {
    namespace: "acme",
    repoName: "app",
    trigger: "mentioned",
    payload: {
      promptContext: "User asked whether export uses the selected season.",
      userPrompt: "@OpenHarness in the export, does it use the current selected season?",
    },
  } as Parameters<typeof buildLinearAgentPrompt>[0];

  it("always includes question-vs-implement behavior guidelines", () => {
    const prompt = buildLinearAgentPrompt(baseRun, "main", null);

    assert.match(prompt, new RegExp(LINEAR_AGENT_BEHAVIOR_GUIDELINES.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(prompt, /OpenHarness Linear agent/);
    assert.match(prompt, /--- USER FOLLOW-UP ---/);
    assert.match(prompt, /does it use the current selected season\?/);
  });

  it("prepends behavior guidelines to custom instructions", () => {
    const prompt = buildLinearAgentPrompt(baseRun, "main", {
      instructions: "Custom agent instructions.",
      model: "",
      targetBranch: "main",
      tools: {},
    });

    assert.ok(prompt.indexOf(LINEAR_AGENT_BEHAVIOR_GUIDELINES) < prompt.indexOf("Custom agent instructions."));
    assert.doesNotMatch(prompt, new RegExp(LINEAR_AGENT_DEFAULT_INSTRUCTIONS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});
