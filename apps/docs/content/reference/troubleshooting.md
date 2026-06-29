---
title: Troubleshooting
description: Common issues and how to fix them.
---

## Missing API key

**Symptom:** Composer shows "Connect a model provider" notice. Chat does not work.

**Fix:**

1. Ask your org admin to add API keys in **Settings → Organization → Secrets**
2. Or connect **Settings → OAuth providers**
3. Or set up **Settings → Local providers**

## Connection lost

**Symptom:** "Connection lost" notice in the composer.

**Fix:**

- Check your internet connection
- Verify the provider API is operational
- Send your message again to retry
- For local providers, ensure the server is running

## Invalid local provider key

**Symptom:** Local model requests fail with authentication errors.

**Fix:**

- Verify the API key in local provider settings (if required)
- Check the server URL and port
- Re-discover models after fixing configuration

## Model errors

**Symptom:** Agent stops with a model or provider error.

**Fix:**

- Switch to a different model in the model switcher
- Verify the org secret for that provider is valid
- Check if the model supports your request (e.g. vision for images)
- For thinking models, try toggling Thinking or Max mode

## GitHub tools unavailable

**Symptom:** PR slash commands missing from picker.

**Fix:**

- Connect organization source control (**Settings → Organization → Source control**)
- Connect the project to GitHub ([GitHub connection](/workspace/github))
- Wait for the GitHub agent to become ready

## Web search unavailable

**Symptom:** `web_search` not in slash picker.

**Fix:** Org admin must add the web search secret in **Settings → Organization → Secrets**.

## Workflow runs fail

**Symptom:** Workflow runs show failed status.

**Fix:**

- Check run detail for error message
- Verify repository and branch are correct
- For local runs, ensure runner is bound and online
- For cloud runs, check environment variables in **Settings → Environments**

## High context usage

**Symptom:** Context gauge near 100%; agent forgets earlier context.

**Fix:** Start a new conversation for a fresh context window.

## Still stuck?

- [Report an issue](https://github.com/simonepriuli/openharness/issues/new) from Help menu
- Check [GitHub releases](https://github.com/simonepriuli/openharness/releases) for known fixes
- Update to the latest app version in **Settings → General**

## Related

- [Quickstart](/quickstart)
- [Secrets](/settings/secrets)
- [Local providers](/settings/local-providers)
