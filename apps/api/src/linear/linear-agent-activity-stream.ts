import type { Database } from "@openharness/db";
import { Result } from "better-result";
import type { LinearAgentActivityContent } from "./linear-client.js";
import { emitLinearAgentActivity } from "./linear-agent-activities.js";
import { tryAllowFailure } from "../result-helpers.js";

function summarizeToolArgs(args: unknown): string | undefined {
  if (args === null || args === undefined) return undefined;
  if (typeof args === "string") {
    const trimmed = args.trim();
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  }
  if (typeof args !== "object") return String(args);

  const serialized = tryAllowFailure(() => JSON.stringify(args));
  if (Result.isError(serialized)) return undefined;
  const json = serialized.value as string;
  return json.length > 120 ? `${json.slice(0, 117)}...` : json;
}

function activityForPiEvent(
  event: unknown,
): { content: LinearAgentActivityContent; ephemeral: boolean } | null {
  if (!event || typeof event !== "object") return null;
  const record = event as Record<string, unknown>;

  switch (record.type) {
    case "tool_execution_start":
      return {
        content: {
          type: "action",
          action: typeof record.toolName === "string" ? record.toolName : "tool",
          parameter: summarizeToolArgs(record.args),
        },
        ephemeral: true,
      };
    case "tool_execution_end": {
      const toolName = typeof record.toolName === "string" ? record.toolName : "tool";
      const isError = record.isError === true;
      return {
        content: {
          type: "action",
          action: toolName,
          result: isError ? "failed" : "completed",
        },
        ephemeral: false,
      };
    }
    case "agent_start":
      return {
        content: {
          type: "thought",
          body: "Agent started working on the request…",
        },
        ephemeral: true,
      };
    default:
      return null;
  }
}

export { activityForPiEvent as mapPiEventToLinearActivity };

export async function processLinearAgentRunEventsForActivities(
  db: Database,
  organizationId: string,
  runId: string,
  events: unknown[],
): Promise<void> {
  for (const event of events) {
    const mapped = activityForPiEvent(event);
    if (!mapped) continue;
    await emitLinearAgentActivity(db, organizationId, runId, mapped.content, {
      ephemeral: mapped.ephemeral,
    });
  }
}
