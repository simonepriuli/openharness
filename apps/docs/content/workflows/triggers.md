---
title: Workflow triggers
description: Events and schedules that start workflow runs.
---

Triggers define when a workflow runs automatically.

## Git PR events

Available when source control is connected:

| Event | Fires when |
|-------|------------|
| PR opened | A new pull request is created |
| PR updated | New commits are pushed to the PR branch |
| PR ready for review | PR moves from draft to ready |
| Comment on diff | Someone comments on a line in the diff |
| Review submitted | A review is submitted on the PR |

### Filters

Some PR triggers support filters:

- **Comment author** — Anyone or non-bot only
- **PR author** — Anyone (additional filters may apply)

## Schedule

Run workflows on a recurring schedule:

| Preset | Description |
|--------|-------------|
| Hourly | Every hour |
| Daily | Once per day |
| Weekly | Once per week |

Custom cron expressions and timezone are also supported.

## Teams mention

Fires when OpenHarness is mentioned in a connected Microsoft Teams channel. Requires [Teams integration](/settings/integrations).

## Discord mention

Fires when OpenHarness is mentioned in a connected Discord channel. Requires [Discord integration](/settings/integrations).

## Linear events

Fires when Linear sends a webhook for a mapped project:

| Event | Fires when |
|-------|------------|
| Issue created | A new issue is created |
| Issue updated | An issue is updated |
| Comment created | A comment is added to an issue |

Requires [Linear integration](/settings/linear). See [Linear triggers](/workflows/linear-triggers).

## Combining triggers

A workflow can have multiple triggers. Any trigger firing starts a new run (subject to concurrency settings).

## Related

- [Create a workflow](/workflows/create)
- [Integrations](/settings/integrations)
- [Source control](/settings/source-control)
