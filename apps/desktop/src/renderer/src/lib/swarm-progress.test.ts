import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getSwarmWorkerStatusLabel,
  parseSwarmWorkerProgress,
  truncateSwarmTaskTitle,
} from "./swarm-progress.js";

describe("truncateSwarmTaskTitle", () => {
  it("returns the full title when under the limit", () => {
    assert.equal(truncateSwarmTaskTitle("Explore mention/file attachment flow"), "Explore mention/file attachment flow");
  });

  it("truncates long titles with an ellipsis", () => {
    const long = "a".repeat(80);
    assert.equal(truncateSwarmTaskTitle(long), `${"a".repeat(67)}...`);
  });
});

describe("getSwarmWorkerStatusLabel", () => {
  it("prefers the structured action label", () => {
    assert.equal(
      getSwarmWorkerStatusLabel({
        index: 0,
        status: "running",
        action: "Running commands",
        task: "Run tests",
      }),
      "Running commands",
    );
  });

  it("falls back to Starting… when no action is available", () => {
    assert.equal(
      getSwarmWorkerStatusLabel({
        index: 0,
        status: "running",
        task: "Run tests",
      }),
      "Starting…",
    );
  });
});

describe("parseSwarmWorkerProgress", () => {
  it("prefers structured worker details", () => {
    const parsed = parseSwarmWorkerProgress(
      {
        details: {
          model: "openrouter/kimi-k2.6",
          workers: [
            {
              index: 0,
              status: "running",
              action: "Exploring files",
              task: "Explore mention/file attachment flow",
            },
          ],
        },
      },
      ["fallback task"],
    );
    assert.deepEqual(parsed, {
      model: "openrouter/kimi-k2.6",
      workers: [
        {
          index: 0,
          status: "running",
          action: "Exploring files",
          preview: undefined,
          task: "Explore mention/file attachment flow",
        },
      ],
    });
  });

  it("parses legacy text progress lines as a fallback", () => {
    const parsed = parseSwarmWorkerProgress(
      {
        content: [
          {
            type: "text",
            text: "Subagent 1: -> Let me read all files systematically\nSubagent 2: ...",
          },
        ],
        details: { model: "kimi-k2.6" },
      },
      ["Explore mention/file attachment flow", "Explore work mode workspace cwd"],
    );
    assert.equal(parsed?.model, "kimi-k2.6");
    assert.deepEqual(parsed?.workers, [
      {
        index: 0,
        status: "running",
        preview: "Let me read all files systematically",
        action: "Exploring files",
        task: "Explore mention/file attachment flow",
      },
      {
        index: 1,
        status: "queued",
        preview: undefined,
        action: undefined,
        task: "Explore work mode workspace cwd",
      },
    ]);
  });
});
