---
title: Execution targets
description: Where workflows run — cloud, local, and runners.
---

Each workflow has an **execution target** that determines where the agent runs.

## Targets

| Target | Behavior |
|--------|----------|
| **Auto** | Prefer cloud execution; fall back to local when needed |
| **Cloud** | Run on organization cloud workers |
| **Local** | Run on a bound org runner on your machine |

## Local vs shared workflows

- **Local only** workflows execute on your desktop and are not shared with the team
- **Shared** workflows are visible to organization members and can run on cloud workers

## Runners

Org runners bind a local repository path to your machine so the organization can dispatch local workflow runs to you.

Configure runners in **Settings → Organization → Runners**:

1. Open the Runners tab
2. Bind a local project path to your runner instance
3. Workflows with Local target use this binding

Runners must be online and connected for local execution.

## Environments

Cloud workers use per-repository environment variables from **Settings → Environments**. See [Environments](/settings/environments).

## Resolved executor

Run details show whether the run executed on **cloud** or **local** and which runner kind was used.

## Related

- [Runners settings](/settings/runners)
- [Environments](/settings/environments)
- [Create a workflow](/workflows/create)
