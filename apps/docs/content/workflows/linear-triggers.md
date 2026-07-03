---
title: Linear triggers
description: Trigger workflows from Linear issue and comment events.
---

Linear triggers fire when OpenHarness receives a webhook for a mapped project.

## Available triggers

| Trigger | When it fires |
|---------|----------------|
| Issue created | A new issue is created in the mapped project |
| Issue updated | An existing issue is updated (status, assignee, fields) |
| Comment created | A new comment is added to an issue in the mapped project |

## Setup

1. Connect Linear under **Settings → Organization → Integrations**.
2. Map the Linear project to the target repository.
3. Add a Linear trigger to the workflow and write instructions describing what the agent should do.
4. Optionally enable Linear tool groups so the agent can post updates back to Linear.

## Execution

When a trigger fires, OpenHarness enqueues a workflow run with issue context in the payload and prepares the repository worktree on the workflow target branch. The agent decides how to use git and Linear tools based on your workflow instructions.

## Related

- [Workflow triggers](/workflows/triggers)
- [Linear integration](/settings/linear)
