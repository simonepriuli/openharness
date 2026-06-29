---
title: Web search
description: Web search in chat and workflows.
---

Web search lets the agent find current information from the internet.

## Enabling web search

An organization admin must configure the **Exa (web search)** secret in **Settings → Organization → Secrets**.

Description in app: "Web search for workflows and chat"

## Using in chat

1. Type `/` in the composer
2. Select **web_search** from Tools
3. Send your message

The agent searches the web and incorporates results into its response.

## Using in workflows

Workflows can use web search when the web search secret is configured. Useful for:

- Researching CVEs and security advisories
- Looking up documentation
- Bug triage with external context

## Privacy

Search queries are sent to the configured web search provider.

## Related

- [Slash commands](/chat/slash-commands)
- [Secrets](/settings/secrets)
