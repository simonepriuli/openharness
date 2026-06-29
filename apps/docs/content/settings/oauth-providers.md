---
title: OAuth providers
description: Sign in to subscription services without API keys.
---

Open **Settings → OAuth providers** to connect subscription-based AI services.

## What OAuth providers do

Some providers (such as ChatGPT/Codex subscriptions) let you authenticate with your existing subscription instead of entering an API key.

## Connecting a provider

1. Open the OAuth providers settings page
2. Click **Connect** on the provider you use
3. Complete authentication in your browser
4. Return to OpenHarness — models from that provider become available

## vs organization secrets

| Method | Best for |
|--------|----------|
| OAuth providers | Personal subscriptions |
| Organization secrets | Team-shared API keys |

You can use both — pinned models in Chat settings can include models from either source.

## Related

- [Secrets](/settings/secrets)
- [Models](/chat/models)
