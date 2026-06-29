---
title: Workspace overview
description: The main OpenHarness layout for coding mode.
---

The OpenHarness workspace in **For coding** mode has four main areas: sidebar, chat workspace, optional right panel, and settings overlay.

<!-- image: workspace layout diagram -->

## Layout regions

### Left sidebar

The sidebar shows **Workflows** and **Repositories** (your projects and conversations). Use the footer for quick access to Settings, Spending, Usage, and theme.

See [Sidebar](/workspace/sidebar) for details.

### Main workspace

The center area displays:

- **Landing state** — When no conversation is selected, you see a project picker and centered composer.
- **Chat timeline** — Message history, tool activity, and agent responses.
- **Composer** — Input area at the bottom for sending messages.

### Right panel

Toggle the right panel from the header button. It has three tabs in coding mode:

| Tab | Purpose |
|-----|---------|
| Files | Browse and preview project files |
| Changes | View unstaged git diffs |
| Plan | Preview plan documents from Plan mode |

See [Right panel overview](/panel/overview).

### Settings overlay

Settings replace the main workspace until you click **Back to app**. Open via `Cmd/Ctrl+,`, the sidebar footer, or the File menu.

## Header

The chat header shows:

- Conversation title (auto-generated from your first message)
- GitHub repository link or **Connect GitHub** button
- Git change stats (+added / −removed lines, file count)
- Update install button (when an app update is ready)
- Right panel toggle

## Workflows workspace

Click **Workflows** in the sidebar to switch to the workflows view. This is separate from chat and includes Overview, Runs, and Settings tabs.

See [Workflows overview](/workflows/overview).

## Related

- [Projects & conversations](/workspace/projects)
- [Menus & tray](/workspace/menus)
- [Chat overview](/chat/overview)
