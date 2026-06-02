# Swarm Mode QA Checklist

- Open a conversation and focus the composer input.
- Press `Cmd+Shift+S` and verify `Swarm ON` appears in the composer toolbar.
- Press `Cmd+Shift+S` again and verify the indicator disappears.
- Send a prompt with Swarm enabled and confirm session state (`get_state`) reports `swarmMode: true`.
- Switch to another conversation and back; confirm each thread keeps its own Swarm toggle state.
- Verify `swarm_dispatch` remains available in active tools, and Swarm mode controls whether the model is instructed/permitted to use it.
- Trigger a `swarm_dispatch` call with 10 tasks and verify execution starts.
- Trigger a `swarm_dispatch` call with 11 tasks and verify the tool returns a limit error.
- Use an unavailable sub-agent model override and verify fallback messaging appears in the tool result.
- Restart desktop app, reconnect an active conversation, and verify Swarm mode can be toggled and reflected again.

## Troubleshooting: agent says Swarm started but nothing runs

Swarm does not auto-run work. The model must call the `swarm_dispatch` tool; the Swarm badge only enables that tool and updates the system prompt.

If the assistant replies that analysis is "in progress" but you see no `swarm_dispatch` activity:

1. Confirm Swarm is on for this thread (`get_state` → `swarmMode: true`).
2. Wait a moment after toggling Swarm before sending (older builds could race toggle vs. send).
3. Re-send with an explicit instruction: "Call swarm_dispatch now with subtasks for …"
4. Check the model supports tool use; some turns end with text only and never invoke tools.

The composer context ring (e.g. `1%`) is token usage, not Swarm progress.

## Troubleshooting: tasks show ok but `(no output)`

Older builds only captured plain `text` parts from worker JSON events. Workers could exit successfully while the model put the answer in a thinking block, or ended on tool calls without a final text reply.

Current behavior:

- Collects full `message_end` assistant payloads (same approach as the subagent extension).
- Falls back to thinking content when text is missing (prefixed with `[reasoning]`).
- Marks empty completions as errors with `stopReason` when available.
- Uses a short append-system-prompt so workers finish with readable text.
- For **reasoning models** (Kimi K2.6, `gpt-oss-120b:free`, etc.), workers get `--thinking low` so OpenRouter does not receive `reasoning.effort: none` from global settings with thinking off.

If you still see `400 Reasoning is mandatory`, restart the desktop app so the updated Pi bundle loads.

If output is still empty, switch the Swarm default model (Settings → Swarm) or retry with an explicit `model` override in `swarm_dispatch`.
