import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBufferingWorkflowEventSink } from "./buffering-event-sink.js";

describe("createBufferingWorkflowEventSink", () => {
  it("flushes buffered events in batches of at most 50", async () => {
    const batches: unknown[][] = [];
    const sink = createBufferingWorkflowEventSink({
      runId: "run-1",
      flushIntervalMs: 10_000,
      appendEvents: async (events) => {
        batches.push(events);
      },
    });

    for (let index = 0; index < 55; index += 1) {
      sink.append({ type: "message_update", index });
    }

    await sink.flush();

    assert.equal(batches.length, 2);
    assert.equal(batches[0]?.length, 50);
    assert.equal(batches[1]?.length, 5);
  });

  it("ignores persist errors when the run is no longer accepting events", async () => {
    let appendCalls = 0;
    const sink = createBufferingWorkflowEventSink({
      runId: "run-inactive",
      flushIntervalMs: 10_000,
      appendEvents: async () => {
        appendCalls += 1;
        throw new Error("Workflow run is not accepting events");
      },
    });

    sink.append({ type: "message_update" });
    await sink.flush();

    assert.equal(appendCalls, 1);
  });

  it("schedules debounced flushes while events stream in", async () => {
    const batches: unknown[][] = [];
    const sink = createBufferingWorkflowEventSink({
      runId: "run-2",
      flushIntervalMs: 20,
      appendEvents: async (events) => {
        batches.push(events);
      },
    });

    sink.append({ type: "agent_start" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    sink.append({ type: "agent_end" });
    await sink.flush();

    assert.ok(batches.length >= 1);
    const total = batches.reduce((sum, batch) => sum + batch.length, 0);
    assert.equal(total, 2);
  });
});
