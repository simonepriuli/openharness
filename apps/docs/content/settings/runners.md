---
title: Runners
description: Bind local repositories for local workflow execution.
---

Open **Settings → Organization → Runners** to configure local workflow execution.

## What runners do

Runners connect your desktop machine to the organization so workflows with **Local** execution target can run on your machine in a bound repository.

## Binding a runner

1. Open the Runners tab
2. Select or confirm your runner instance
3. Bind a local project path to the runner
4. Keep OpenHarness running for local workflow dispatch

## Auto-connect

OpenHarness may attempt to auto-connect source control when binding runners to repositories that match org-connected remotes.

## When local execution is used

- Workflow execution target set to **Local**
- **Auto** target when cloud is unavailable
- Organization dispatches a run to your bound runner

## Related

- [Execution targets](/workflows/execution)
- [Create a workflow](/workflows/create)
