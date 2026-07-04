import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPiEventToLinearActivity } from "./linear-agent-activity-stream.js";

describe("mapPiEventToLinearActivity", () => {
  it("maps tool execution start to an ephemeral action", () => {
    assert.deepEqual(
      mapPiEventToLinearActivity({
        type: "tool_execution_start",
        toolName: "read",
        args: { path: "README.md" },
      }),
      {
        content: {
          type: "action",
          action: "read",
          parameter: '{"path":"README.md"}',
        },
        ephemeral: true,
      },
    );
  });

  it("maps tool execution end to a completed action", () => {
    assert.deepEqual(
      mapPiEventToLinearActivity({
        type: "tool_execution_end",
        toolName: "bash",
        isError: false,
      }),
      {
        content: {
          type: "action",
          action: "bash",
          result: "completed",
        },
        ephemeral: false,
      },
    );
  });

  it("returns null for unsupported events", () => {
    assert.equal(mapPiEventToLinearActivity({ type: "message_end" }), null);
  });
});
