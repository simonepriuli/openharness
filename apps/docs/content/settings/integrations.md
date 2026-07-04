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
- Trigger **Linear automations** on issue and comment events (workflows)
- Map Linear projects to repositories
- Configure the native **Linear agent** (@mention / delegate) on **Organization → Linear Agents**

Linear automations and the Linear agent are separate features. Automations use workflow triggers; the agent uses Linear Agent Sessions and runs on cloud workers only.

See [Linear integration](/settings/linear).

## Workflow integration

| Feature | Teams | Discord | Linear |
|---------|-------|---------|--------|
| Mention trigger | Yes | Yes | — (native agent) |
| Issue/comment triggers | — | — | Yes (automations) |
| Native @mention/delegate agent | — | — | Yes |
| Run notification | Yes | Yes | Via agent tools / activities |
| Bug triage template | Yes | Yes | — |
| CVE scan template | Yes | Yes | — |

## Related

- [Workflow triggers](/workflows/triggers)
- [Workflow templates](/workflows/templates)
