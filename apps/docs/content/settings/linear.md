---
title: Linear integration
description: Connect Linear for automations, agent tools, and the native Linear agent.
---

Open **Settings → Organization → Integrations** to connect Linear.

## Linear automations vs Linear agent

OpenHarness supports two separate Linear features:

| | **Linear automations** | **Linear agent** |
|---|---|---|
| What it is | Workflows triggered by issue/comment events | Native agent you @mention or delegate to |
| Configuration | Workflows editor | **Organization → Linear Agents** |
| Trigger | Issue created/updated, comment created | Agent session created or prompted |
| Execution | Local desktop and/or cloud (per workflow) | **Cloud workers only** |
| Output in Linear | Agent tools (comments, updates) | Agent Activities (thought, actions, response) |

Project ↔ repository mappings live on the Integrations tab and are shared by both features.

## Connect Linear

1. Choose **Connect Linear** and authorize the OpenHarness OAuth app for your workspace.
2. Map **Linear projects** to OpenHarness repositories.
3. For workflow automations, enable Linear triggers and tools on the relevant workflows.
4. For the native agent, open **Organization → Linear Agents**, reconnect if prompted for agent scopes, and enable the agent per mapping.

Automations work with the standard Linear OAuth scopes. The Linear agent additionally requires `app:assignable` and `app:mentionable`. If you connected Linear before the agent feature shipped, use **Reconnect Linear** on Integrations or Linear Agents.

Your Linear OAuth app must also enable **Agent session events** in the Linear developer console. The webhook URL is unchanged (`/api/linear/webhook`).

## Project mapping

Each mapping links one Linear project to one source-control repository. When Linear sends a webhook for an issue in that project, OpenHarness resolves the mapped repo and can prepare a git worktree on the workflow or agent target branch.

## Agent tools (chat and workflows)

When Linear is connected, desktop chat sessions receive Linear tools automatically. Workflow runs can enable grouped tools:

| Group | Capabilities |
|-------|----------------|
| Read | Search/list issues, projects, teams, cycles, labels |
| Write | Create/update issues, assign, change status, link URLs |
| Comments | List and create issue comments |

## Linear agent

Configure the agent per mapping on **Organization → Linear Agents**:

- Enable the agent for a project ↔ repo mapping (disabled by default)
- Choose model, instructions, target branch, and allowed tools
- Requires cloud workers to be enabled for your organization

When someone @mentions OpenHarness or delegates an issue to the app, Linear sends an `AgentSessionEvent`. OpenHarness queues a cloud agent run and posts Agent Activities back to the session (thought, milestone actions, response or error).

Follow-up messages in the same session create a new agent run linked to that session.

## Related

- [Linear workflow triggers](/workflows/linear-triggers)
- [Workflow tools](/workflows/tools)
- [Integrations](/settings/integrations)
