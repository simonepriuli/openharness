---
title: Chat timeline
description: What you see in agent responses — markdown, tools, edits, and reasoning.
---

The chat timeline displays the full conversation history between you and the agent.

## User messages

Your messages show:

- Plain text with rendered `@` mention chips
- `/` tool and skill chips
- Pasted images (when sent)

## Assistant messages

Agent replies render as formatted markdown with:

- Headings, lists, code blocks, and tables
- Links and inline code

## Reasoning blocks

When the model uses extended thinking, reasoning content may appear in collapsible blocks. Expand to read the model's internal reasoning.

See [Thinking & Max mode](/chat/thinking).

## Tool activity

While the agent works, you see tool activity in the timeline:

### Explore steps

Grouped read-only operations during exploration:

- `read` — File reads
- `grep` — Content search
- `ls` — Directory listings
- `find` — File discovery

### Individual tool lines

While streaming, each tool call may appear as its own line with status.

### File edit summaries

When a turn completes, file writes and edits collapse into a summary batch showing which files changed.

## Swarm workers

In [Swarm mode](/chat/swarm-mode), parallel sub-agents appear as worker rows with task title, model, and status.

## Thinking indicator

A thinking indicator shows during generation before content streams.

## Related

- [Chat overview](/chat/overview)
- [Changes panel](/panel/changes)
- [Agent capabilities](/reference/agent-capabilities)
