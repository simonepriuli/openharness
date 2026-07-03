---
title: Linear integration
description: Connect Linear for agent tools and workflow triggers.
---

Open **Settings → Organization → Integrations** to connect Linear.

## Connect Linear

1. Choose **Connect Linear** and authorize the OpenHarness OAuth app for your workspace.
2. Map **Linear projects** to OpenHarness repositories.
3. Enable Linear tools and triggers on workflows that should react to issue activity.

## Project mapping

Each mapping links one Linear project to one source-control repository. When Linear sends a webhook for an issue in that project, OpenHarness resolves the mapped repo and can prepare a git worktree on the workflow target branch.

## Agent tools

When Linear is connected, desktop chat sessions receive Linear tools automatically. Workflow runs can enable grouped tools:

| Group | Capabilities |
|-------|----------------|
| Read | Search/list issues, projects, teams, cycles, labels |
| Write | Create/update issues, assign, change status, link URLs |
| Comments | List and create issue comments |

## Related

- [Linear workflow triggers](/workflows/linear-triggers)
- [Workflow tools](/workflows/tools)
