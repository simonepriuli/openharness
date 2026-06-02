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
