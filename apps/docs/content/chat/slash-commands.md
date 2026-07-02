---
title: Slash commands
description: Tools and skills available via the / picker in the composer.
---

Type `/` in the composer to open the slash command picker. Commands are grouped into **Tools** and **Skills**.

## Opening the picker

1. Type `/` at the start of a segment or after a space
2. Browse or type to filter
3. Select an item with **Enter** or click

Selected tools appear as chips in the composer, similar to mentions.

## Tools

Tools extend what the agent can do in a single turn.

| Tool | Description | Availability |
|------|-------------|--------------|
| `web_search` | Search the web | Web search secret configured |
| `pr_comment` | Review a PR on GitHub | GitHub agent ready |
| `pr_approve` | Approve a pull request | GitHub agent ready |
| `pr_create` | Create a pull request | GitHub agent ready |
| `pr_push` | Commit and push a branch | GitHub agent ready |

### Web search

Requires a web search API key in **Settings → Organization → Secrets**. See [Web search](/reference/web-search).

### GitHub PR tools

Require a connected GitHub repository and organization source control. See [GitHub connection](/workspace/github).

## Skills

**Skills** are packaged capabilities from extensions. The list is dynamic and depends on your session and installed extensions.

Invoke a skill by selecting it from the picker or typing `/skill:name` in your message.

See [Skills](/reference/skills).

## Attach

Use **Attach file or folder** to grant the agent access to files or folders outside the project working directory. You can also drag files or folders into the composer.

This command is available in both **For coding** and **For everyday work** modes.

## Related

- [Agent capabilities](/reference/agent-capabilities)
- [Skills](/reference/skills)
- [Web search](/reference/web-search)
