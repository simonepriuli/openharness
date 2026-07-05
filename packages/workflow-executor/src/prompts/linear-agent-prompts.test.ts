import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LINEAR_AGENT_BEHAVIOR_GUIDELINES,
  LINEAR_AGENT_DEFAULT_INSTRUCTIONS,
  buildLinearAgentFollowUpPrompt,
  buildLinearAgentPrompt,
  buildLinearAgentPromptedRunPrompt,
  resolveLinearAgentPiPrompt,
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

describe("resolveLinearAgentPiPrompt", () => {
  const promptedRun = {
    namespace: "acme",
    repoName: "app",
    trigger: "prompted",
    payload: {
      promptContext: "Long original issue context that should not be resent on follow-up.",
      userPrompt: "@openharness is it merged now?",
      issue: { identifier: "ENG-42", title: "Add export feature" },
    },
  } as Parameters<typeof resolveLinearAgentPiPrompt>[0];

  it("sends only the user message when resuming a Pi session", () => {
    const prompt = resolveLinearAgentPiPrompt(promptedRun, "main", null, { sessionMode: "resume" });

    assert.equal(prompt, "@openharness is it merged now?");
    assert.doesNotMatch(prompt, /Long original issue context/);
  });

  it("uses a lighter prompt for prompted runs without a saved session", () => {
    const prompt = resolveLinearAgentPiPrompt(promptedRun, "main", null, { sessionMode: "new" });

    assert.match(prompt, /--- USER MESSAGE ---/);
    assert.match(prompt, /is it merged now\?/);
    assert.doesNotMatch(prompt, /--- LINEAR AGENT SESSION ---/);
    assert.doesNotMatch(prompt, /Long original issue context/);
  });

  it("keeps the full prompt for initial delegated runs", () => {
    const delegatedRun = {
      ...promptedRun,
      trigger: "delegated",
    } as Parameters<typeof resolveLinearAgentPiPrompt>[0];

    const prompt = resolveLinearAgentPiPrompt(delegatedRun, "main", null, { sessionMode: "new" });

    assert.match(prompt, /--- LINEAR AGENT SESSION ---/);
    assert.match(prompt, /Long original issue context/);
  });
});

describe("buildLinearAgentFollowUpPrompt", () => {
  it("falls back to promptContext when userPrompt is empty", () => {
    const prompt = buildLinearAgentFollowUpPrompt({
      payload: { promptContext: "Follow-up context from Linear" },
    });
    assert.equal(prompt, "Follow-up context from Linear");
  });
});

describe("buildLinearAgentPromptedRunPrompt", () => {
  it("omits issue description to keep follow-up prompts small", () => {
    const prompt = buildLinearAgentPromptedRunPrompt(
      {
        namespace: "acme",
        repoName: "app",
        trigger: "prompted",
        payload: {
          userPrompt: "status?",
          issue: {
            identifier: "ENG-1",
            title: "Fix bug",
            description: "Very long description that should not be included",
          },
        },
      } as Parameters<typeof buildLinearAgentPromptedRunPrompt>[0],
      "main",
      null,
    );

    assert.match(prompt, /ENG-1/);
    assert.doesNotMatch(prompt, /Very long description/);
  });
});
