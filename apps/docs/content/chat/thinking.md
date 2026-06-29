---
title: Thinking & Max mode
description: Extended reasoning for supported models.
---

Some models support extended thinking (reasoning) before responding. OpenHarness exposes this as **Thinking** and **Max mode** in the model switcher.

## Thinking toggle

For models that support optional reasoning:

1. Open the model switcher
2. Toggle **Thinking** on or off

When enabled, the model spends additional tokens on internal reasoning. You see reasoning blocks in the [timeline](/chat/timeline) when the model exposes them.

## Max mode

Some reasoning models require or benefit from maximum thinking depth:

- **Max mode** appears for models that support it
- Certain models require Max mode and enable it automatically
- Max mode maps to the highest supported thinking level for that model

## What you see

During generation with thinking enabled:

- A thinking indicator appears in the timeline
- Reasoning blocks may show collapsed content you can expand
- Tool calls happen after reasoning completes

## Model differences

Not all models support thinking. The switcher only shows thinking controls for compatible models. Check your provider's model documentation for reasoning support.

## Related

- [Models](/chat/models)
- [Timeline](/chat/timeline)
