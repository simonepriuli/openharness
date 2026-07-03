---
title: Debug mode
description: Investigate bugs with repro steps, logs, and stack traces before applying fixes.
---

Debug mode helps you find root causes without premature code edits. The agent focuses on reproduction, log analysis, and evidence gathering, then writes a debug report before fixing anything.

## Enabling Debug mode

- Press **Shift+Tab** to cycle to Debug mode (after Plan and Swarm)
- Open the composer **+** menu and choose **Debug**
- A **Debug** chip appears in the composer

Debug mode is available in **coding work mode** only (same as Plan and Swarm).

## Investigation phase

In Debug mode, the agent:

- Uses read tools (read, grep, find, ls) to inspect the codebase
- Runs repro and diagnostic bash commands (tests, `curl`, `npm test`, and similar)
- Does **not** edit files or call `swarm_dispatch` until the root-cause report is written
- Asks clarifying questions when repro details are missing

Destructive bash commands (file writes, installs, git mutations) remain blocked.

## Debug report

When the agent is confident about the root cause, it calls `write_debug_report` with freeform markdown. The report is saved to:

```
.openharness/debug/<conversationId>.md
```

After the report is written, `edit` and `write` tools are unblocked. The agent should ask you before applying fixes.

## Exiting Debug mode

Click the **×** on the Debug chip to exit.

- If a report was already written, the file is kept on disk.
- If you exit before a report exists, there is nothing to delete.

## Related

- [Plan mode](/chat/plan-mode)
- [Swarm mode](/chat/swarm-mode)
- [Questions](/chat/questions)
