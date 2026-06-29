---
title: Projects & conversations
description: Opening folders, managing conversations, and the landing state.
---

Projects are local folders you open in OpenHarness. Conversations are chat threads scoped to each project.

## Opening a project

1. Click **Open folder** in the sidebar or press `Cmd/Ctrl+O`.
2. Select a directory on your machine.
3. The project appears under **Repositories**.

OpenHarness remembers your projects and restores the last-used project on launch.

When a project is added, OpenHarness creates an empty `.openharness/` directory for plans and project-specific agent data.

## Landing state

When no conversation is selected, the main area shows:

- A project picker
- A centered composer where you can type and send immediately

Sending from the landing composer creates a new conversation and starts the agent session. If Plan mode is toggled, the new conversation begins in Plan mode.

## Conversations

Each project can have multiple conversations (threads). Conversations are stored locally with `coding` context.

### Starting a new conversation

- Click **+** next to the project name in the sidebar
- Press `Cmd/Ctrl+N` when a project is selected
- Send a message from the landing composer

### Auto-titles

Conversation titles are generated automatically from your first message. Configure the title model in **Settings → Chat**.

### Archiving

- **Single conversation** — Use the conversation row menu → Archive
- **All conversations** — Project menu → Archive all chats

Archived conversations are removed from the default list but data remains on disk.

### Persistence

Conversations and agent sessions persist locally per project. Closing and reopening the app restores your threads.

### Streaming indicator

When the agent is running, the sidebar shows a streaming indicator on the active conversation.

## Removing a project

Project menu → **Remove project** removes the folder from the sidebar. Your files on disk are not deleted.

## Related

- [GitHub connection](/workspace/github)
- [Chat overview](/chat/overview)
- [Workspace overview](/workspace/overview)
