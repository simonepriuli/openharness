---
title: Workflows overview
description: Automate PR reviews, scans, and triage with workflows.
---

Workflows let you run the OpenHarness agent automatically on a schedule or when events occur — such as pull request updates, Teams mentions, or cron schedules.

Workflows are available in **For coding** mode only.

## Opening workflows

Click **Workflows** in the sidebar. The workflows workspace has three tabs:

| Tab | Purpose |
|-----|---------|
| **Overview** | List and manage workflow definitions |
| **Runs** | View run history and live output |
| **Settings** | Configure workflow summarization model |

## Workflow list

The Overview tab shows:

- **Mine** vs **Team** filter
- Scope icons: **Local** (your machine) vs **Shared** (organization)
- Stats sparkline, success rate, and repository name per workflow

Actions: create, edit, delete, and manually run workflows.

## Active runs

When a workflow run is in progress, the sidebar **Workflows** item shows a live indicator.

## What workflows can do

- Review pull requests and post comments
- Fix issues from PR comments
- Scan dependencies for CVEs
- Triage bugs from Teams or Discord mentions
- Run on a schedule (hourly, daily, weekly, or custom cron)

## Related

- [Create a workflow](/workflows/create)
- [Triggers](/workflows/triggers)
- [Templates](/workflows/templates)
- [Runs](/workflows/runs)
