---
title: Workflow runs
description: Monitor run history, live output, and results.
---

The **Runs** tab in the workflows workspace shows execution history for all workflows.

## Run list

Each run displays:

- Workflow name
- Trigger label (what started the run)
- Status (running, succeeded, failed, dismissed)
- Duration and timestamps
- Executor (cloud or local)

Click a run to open the detail view.

## Run detail

The detail view shows:

- Full status and error message (if failed)
- Live streaming output while the run is active
- Iteration count for multi-step workflows

## Result types

Depending on the workflow, results may include:

| Type | Content |
|------|---------|
| CVE scan | Table of vulnerabilities with severity and package info |
| Bug triage | Summary and recommended actions |
| PR review | Review comments and approval status |
| General | Markdown summary of agent output |

## Dismissing runs

Dismiss a run to mark it closed without waiting for completion. Useful for stuck or unwanted runs.

## Active run indicator

When any workflow is running, the sidebar **Workflows** item shows a live indicator.

## Related

- [Workflows overview](/workflows/overview)
- [Execution targets](/workflows/execution)
