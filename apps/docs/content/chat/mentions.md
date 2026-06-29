---
title: File mentions
description: Add file context to messages with @ mentions.
---

Use `@` mentions to include specific files in your message context. The agent receives the file paths you mention and can read them as part of the conversation.

## Using mentions

1. Type `@` in the composer
2. A file search picker opens
3. Type to filter files in your project
4. Use **↑** / **↓** to navigate, **Enter** or **Tab** to select
5. Press **Escape** to close the picker

Selected files appear as chips in the composer.

## Paths with spaces

For paths containing spaces, use quoted syntax:

```
@"src/my component/App.tsx"
```

## Removing mentions

Press **Backspace** when the cursor is after a mention chip to remove it.

## How mentions appear

In sent messages, mentions render as styled chips showing the file path. The agent uses these paths to locate and read files.

## Tips

- Mention entry points (e.g. `@src/main.ts`) when asking about architecture
- Mention test files when asking for test changes
- Combine multiple mentions in one message for cross-file questions

## Related

- [Chat overview](/chat/overview)
- [Files panel](/panel/files)
- [Code actions](/panel/code-actions)
