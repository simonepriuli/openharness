---
title: GitHub connection
description: Connect local projects to GitHub repositories for workflows and automation.
---

Linking a local project to GitHub enables workflow triggers, PR tools in chat, and repository context in the header.

## Per-project connection

### Connect

1. Open the project menu (**⋯** on the project row) → **Connect GitHub repository**
2. Or click **Connect GitHub** in the chat header
3. Select the repository that matches your local folder
4. Confirm the connection

### Disconnect

Project menu → **Disconnect GitHub repository**

## Header indicators

When connected, the chat header shows:

- A link to the GitHub repository
- Git change stats: lines added, lines removed, and changed file count

## Auto-connect

OpenHarness may attempt to auto-connect when your local folder's git remote matches an organization-connected repository.

## Organization source control

Org admins configure GitHub at the organization level in **Settings → Organization → Source control**. This enables:

- Repository pickers in workflows
- PR event triggers
- GitHub agent tools in chat and workflows

See [Source control settings](/settings/source-control).

## GitHub tools in chat

When the GitHub agent is ready, slash commands become available:

| Tool | Purpose |
|------|---------|
| `pr_comment` | Review a pull request |
| `pr_approve` | Approve a pull request |
| `pr_create` | Create a pull request |
| `pr_push` | Commit and push a branch |

See [Slash commands](/chat/slash-commands).

## Related

- [Workflows triggers](/workflows/triggers)
- [Source control](/settings/source-control)
