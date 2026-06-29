---
title: Organization secrets
description: Cloud API keys, web search, and OpenRouter management.
---

Organization admins configure shared credentials in **Settings → Organization → Secrets**.

All organization members use these secrets for chat and workflows.

## Cloud provider API keys

Add API keys for cloud model providers:

- Anthropic
- OpenAI
- OpenRouter
- Other curated providers in the secrets list

Each key is stored securely and used for all members' sessions when they select models from that provider.

## Web search

The **Exa (web search)** secret enables [web search](/reference/web-search) in chat and workflows.

Description in app: "Web search for workflows and chat"

## OpenRouter management key

The **OpenRouter management** secret enables:

- Credit balance in the sidebar **Spending** panel
- All-time and monthly spend tracking

Description in app: "OpenRouter account credits in the workspace panel"

## Managing secrets

Admins can:

- **Add** a new secret for an empty slot
- **Edit** to update an existing key
- **Remove** a configured secret

Secret values are never displayed after saving — only a hint that a value is set.

## Related

- [Models](/chat/models)
- [Web search](/reference/web-search)
- [Usage & billing](/reference/usage-billing)
