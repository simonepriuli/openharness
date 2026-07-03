---
title: Integrations
description: Microsoft Teams, Discord, and Linear for workflows and notifications.
---

Open **Settings → Organization → Integrations** to connect chat platforms.

## Microsoft Teams

Connect Teams to:

- Trigger workflows on channel mentions
- Send workflow notifications to Teams channels
- Map repositories to Teams channels

### Channel mapping

Configure which Teams channel corresponds to which repository. Mention OpenHarness in that channel to trigger mention-based workflows.

## Discord

Connect Discord to:

- Trigger workflows on channel mentions
- Send workflow notifications to Discord channels
- Map repositories to Discord channels

## Linear

Connect Linear to:

- Give agents grouped Linear tools in chat and workflows
- Trigger workflows on issue and comment events
- Map Linear projects to repositories

See [Linear integration](/settings/linear).

## Workflow integration

| Feature | Teams | Discord | Linear |
|---------|-------|---------|--------|
| Mention trigger | Yes | Yes | — |
| Issue/comment triggers | — | — | Yes |
| Run notification | Yes | Yes | Via agent tools |
| Bug triage template | Yes | Yes | — |

## Related

- [Workflow triggers](/workflows/triggers)
- [Workflow templates](/workflows/templates)
