---
title: Plan mode
description: Interview, plan, and implement features without premature edits.
---

Plan mode helps you design a feature or fix before the agent writes code. The agent explores your codebase read-only, asks clarifying questions, and writes a plan document you can review before implementation.

## Enabling Plan mode

- Press **Shift+Tab** to cycle to Plan mode
- A **Plan** chip appears in the composer
- On the landing page, a hint shows "Plan mode ⇧+Tab"

## Interview phase

In Plan mode, the agent:

- Uses read-only tools (read, grep, ls) to explore the codebase
- Asks questions via the [question panel](/chat/questions)
- Does **not** edit files or run destructive bash commands
- Only safe bash commands are allowed

## Plan document

When the interview is complete, the agent writes a plan to:

```
.openharness/plans/<conversationId>.md
```

## Plan tab

Open the **Plan** tab in the right panel to preview the live markdown plan as it is written.

See [Plan panel](/panel/plan).

## Implement plan

When the plan is ready, an **Implement plan** button appears:

1. Review the plan in the Plan tab
2. Click **Implement plan**
3. OpenHarness sends a silent implementation prompt and exits Plan mode
4. The agent executes the plan with full write and bash tools

## Exiting Plan mode

Click the **×** on the Plan chip to exit. This aborts the interview and deletes the draft plan.

## Related

- [Questions](/chat/questions)
- [Plan panel](/panel/plan)
- [Swarm mode](/chat/swarm-mode)
