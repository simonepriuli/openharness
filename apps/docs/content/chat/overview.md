---
title: Chat overview
description: Sending messages, stopping responses, and conversation basics.
---

The chat workspace is where you interact with the OpenHarness coding agent.

## Sending messages

1. Type in the composer at the bottom of the screen
2. Press **Enter** to send
3. Press **Shift+Enter** for a new line without sending

You can send from the landing composer before selecting a conversation — this creates a new thread automatically.

## Stopping a response

Click **Stop** while the agent is streaming to abort the current response. The partial response remains in the timeline.

## Steer while streaming

If the agent is still responding and you have text in the composer, you can send a follow-up message to steer the conversation without waiting for completion.

## Auto-titles

The first message in a conversation generates an automatic title shown in the sidebar and header. Change the title model in **Settings → Chat**.

## Composer modes

Press **Shift+Tab** to cycle between:

1. **Normal** — Full coding agent with read, write, edit, and bash tools
2. **Plan** — Interview and planning without file edits
3. **Swarm** — Parallel sub-agents for complex tasks

See [Plan mode](/chat/plan-mode) and [Swarm mode](/chat/swarm-mode).

## Error notices

The composer may show persistent notices:

| Notice | Meaning | Action |
|--------|---------|--------|
| Connect a model provider | No API keys or providers configured | Open Organization settings |
| Connection lost | Network or provider error | Send again to retry |
| Generic error | Other failure | Dismiss and retry |

## Related

- [File mentions](/chat/mentions)
- [Slash commands](/chat/slash-commands)
- [Models](/chat/models)
- [Timeline](/chat/timeline)
