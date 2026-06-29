---
title: Plan panel
description: Preview and implement plan documents from Plan mode.
---

The **Plan** tab appears when a plan document exists for the current conversation.

## Plan preview

The panel renders the plan markdown live as the agent writes it during [Plan mode](/chat/plan-mode). Plans are stored at:

```
.openharness/plans/<conversationId>.md
```

## Implement plan

When the plan is marked ready, an **Implement plan** button appears in the panel (and in the composer area).

Clicking it:

1. Sends a silent implementation prompt to the agent
2. Exits Plan mode
3. Allows the agent to edit files and run commands per the plan

## When the tab appears

The Plan tab is visible when Plan mode has been used in the conversation or a plan file exists. If no plan exists, the tab may be hidden or empty.

## Related

- [Plan mode](/chat/plan-mode)
- [Right panel overview](/panel/overview)
