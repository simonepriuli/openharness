---
title: Code actions
description: Quick prompts from code selections in the Files panel.
---

Select text in the Files panel preview to open the code actions toolbar.

## Available actions

| Action | What it does |
|--------|--------------|
| **Explain** | Asks the agent to explain the selected code |
| **Bug discovery** | Asks the agent to look for potential bugs |
| **Refactor** | Suggests refactoring improvements |
| **Add tests** | Requests tests for the selected code |
| **Document** | Asks for documentation of the selection |

## How it works

1. Open a file in the **Files** tab
2. Select a range of text
3. Click an action in the toolbar
4. A prefilled prompt appears in the composer with:
   - The selected code
   - File path
   - Line numbers

5. Edit the prompt if needed and send

## Tips

- Select a function or class for focused explanations
- Use **Add tests** after implementing new logic
- Combine with `@` mentions for additional context files

## Related

- [Files panel](/panel/files)
- [Chat overview](/chat/overview)
