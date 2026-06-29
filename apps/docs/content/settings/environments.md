---
title: Environments
description: Per-repository variables for cloud workflow workers.
---

Open **Settings → Environments** to manage environment variables for cloud workflow execution.

## Repository environments

Each connected repository can have its own set of environment variables passed to cloud workers during workflow runs.

## Variable types

| Type | Description |
|------|-------------|
| **Plain** | Non-sensitive configuration values |
| **Secret** | Encrypted values (API tokens, passwords) |

## Adding variables

1. Select a repository from the environments list
2. Click **Add variable**
3. Enter key (UPPER_SNAKE_CASE) and value
4. Choose plain or secret type
5. Save

Reserved names and `OPENHARNESS_*` prefixes are blocked.

## When variables are used

Cloud workflow workers receive these variables when executing workflows on that repository. Use them for:

- API endpoints
- Service tokens
- Build configuration
- Feature flags

## Related

- [Execution targets](/workflows/execution)
- [Create a workflow](/workflows/create)
