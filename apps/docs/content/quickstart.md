---
title: Quickstart
description: Get OpenHarness running and send your first message in minutes.
---

Follow these steps to go from download to your first agent response.

## 1. Download OpenHarness

Visit [openharness.dev](https://openharness.dev) and download the installer for your platform (macOS, Windows, or Linux).

Install the app and launch it from your applications folder or Start menu.

<!-- image: download page -->

## 2. Sign in with GitHub

On first launch, click **Continue with GitHub**. Your browser opens for authentication. After approving access, return to OpenHarness.

You must join or create an organization before using the app. See [Sign in](/sign-in) for details.

## 3. Connect a model provider

Before chatting, configure at least one way to call AI models:

| Option | Who configures | Where |
|--------|----------------|-------|
| Organization API keys | Org admin | Settings → Organization → Secrets |
| OAuth subscription | You | Settings → OAuth providers |
| Local server (Ollama, LM Studio) | You | Settings → Local providers |

If no provider is configured, the composer shows a **Connect a model provider** notice with a link to settings.

## 4. Open a project folder

1. Click **Open folder** in the sidebar header, or press `Cmd+O` (macOS) / `Ctrl+O` (Windows/Linux).
2. Select a local repository or project directory.
3. The folder appears under **Repositories** in the sidebar.

OpenHarness creates a `.openharness/` directory in your project for plans and project-specific agent data.

## 5. Start a conversation

1. Select your project in the sidebar.
2. Click **+** next to the project name to start a new conversation, or use the landing composer.
3. Type a message and press **Enter** to send.

Example prompts:

- "What does this project do? Read the README and summarize the architecture."
- "Find where authentication is handled and explain the flow."
- "Add a unit test for the `formatDate` utility."

## 6. Explore the workspace

- **Right panel** — Toggle with the panel button in the header. Browse files, view git changes, or read plan documents.
- **Model switcher** — Pick a model in the composer footer. Pin favorites in Settings → Chat.
- **Plan mode** — Press `Shift+Tab` to cycle modes. Plan mode interviews you before writing a plan.

## Next steps

- [Workspace overview](/workspace/overview) — Learn the layout
- [Composer guide](/chat/overview) — Mentions, slash commands, and modes
- [Model providers](/settings/secrets) — Configure cloud and local models
