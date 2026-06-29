---
title: Usage & billing
description: Token usage, OpenRouter credits, and session costs.
---

OpenHarness tracks AI usage so you can monitor costs and token consumption.

## Workspace panel

Open the sidebar footer panel for quick stats:

| Item | Shows |
|------|-------|
| **Spending** | OpenRouter credits remaining, all-time and monthly spend |
| **Usage** | Total tokens all-time and this month |

Spending data requires an OpenRouter management key in **Settings → Organization → Secrets**.

## Session cost

The composer footer shows estimated **session cost** next to the context gauge when pricing data is available.

## Context gauge

The token usage percentage shows how much of the model's context window the current conversation has consumed.

## Adding credits

Links in the Spending panel direct you to add OpenRouter credits or configure the management key in organization secrets.

## Organization vs personal

- **Organization secrets** — Shared API keys; usage applies to the org account
- **OAuth providers** — Personal subscription usage
- **Local providers** — No cloud billing; runs on your hardware

## Related

- [Secrets](/settings/secrets)
- [Models](/chat/models)
