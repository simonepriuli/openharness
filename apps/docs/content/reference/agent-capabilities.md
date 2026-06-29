---
title: Agent capabilities
description: What the OpenHarness coding agent can do in your project.
---

OpenHarness includes a coding agent with a full toolset for software development. In **Normal** mode, the agent can read, write, edit, search, and run commands in your project.

## File operations

| Capability | Description |
|------------|-------------|
| Read files | Read any file in the project |
| Write files | Create new files |
| Edit files | Apply targeted edits to existing files |
| Search | Grep and find across the codebase |
| List directories | Explore project structure |

## Shell commands

The agent can run bash commands in your project directory:

- Install dependencies
- Run tests and builds
- Execute scripts
- Git operations (status, diff, commit when asked)

Destructive commands may be blocked in [Plan mode](/chat/plan-mode).

## Project memory

OpenHarness stores project-specific data in `.openharness/`:

- Plan documents (`plans/`)
- Other agent guidance files

The agent may read and update these files as part of workflows.

## Extensions and tools

Additional capabilities come from built-in extensions and tools:

- [Web search](/reference/web-search)
- [GitHub PR tools](/chat/slash-commands) (when connected)
- [Skills](/reference/skills) (dynamic list)
- Plan mode tools (`write_plan`)
- Swarm dispatch ([Swarm mode](/chat/swarm-mode))

## What the agent cannot do

- Access files outside the project without explicit paths
- Use cloud APIs without configured providers
- Run GitHub tools without org source control and project connection

## Related

- [Chat overview](/chat/overview)
- [Slash commands](/chat/slash-commands)
- [Timeline](/chat/timeline)
