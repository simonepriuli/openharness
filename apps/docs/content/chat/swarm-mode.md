---
title: Swarm mode
description: Parallel sub-agents for complex, multi-part tasks.
---

Swarm mode dispatches parallel sub-agents to work on different parts of a task simultaneously.

## Enabling Swarm mode

- Press **Shift+Tab** to cycle to Swarm mode
- Press `Cmd/Ctrl+Shift+S` to toggle Swarm mode
- Click the **Swarm** chip in the composer

A **Swarm** chip appears when active.

## How it works

The main agent uses `swarm_dispatch` to spawn sub-agents. Each sub-agent:

- Receives a focused sub-task
- Runs with a configurable model (default in Settings → Swarm)
- Reports progress in the timeline as a swarm worker row

## Swarm workers in the timeline

Each worker shows:

- Task title
- Model used
- Status (running, completed, failed)

Expand worker rows to see their output.

## Default sub-agent model

Configure the default model for swarm workers in **Settings → Swarm**. Individual dispatches may override this.

## When to use Swarm

Swarm mode works well for:

- Large refactors spanning many files
- Parallel exploration of unrelated code areas
- Tasks that decompose into independent sub-tasks

For simple single-file changes, Normal mode is usually faster.

## Related

- [Swarm settings](/settings/swarm)
- [Timeline](/chat/timeline)
- [Plan mode](/chat/plan-mode)
