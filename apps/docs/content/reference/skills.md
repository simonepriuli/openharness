---
title: Skills
description: Invoke agent skills via the slash command picker.
---

Skills are reusable capabilities that package prompts, tools, and workflows the agent can invoke for specific tasks.

## Invoking skills

### Slash picker

1. Type `/` in the composer
2. Open the **Skills** group
3. Select a skill

### Direct syntax

Type the skill name in your message:

```
/skill:skill-name
```

## Available skills

The skill list is **dynamic** — it depends on:

- Installed extensions
- Your current session
- Organization configuration

Skills appear in the slash picker when available.

## Skills vs tools

| Type | Purpose |
|------|---------|
| **Tools** | Single actions (web search, PR comment) |
| **Skills** | Multi-step packaged workflows |

## Related

- [Slash commands](/chat/slash-commands)
- [Agent capabilities](/reference/agent-capabilities)
