---
title: Source control settings
description: Connect GitHub and Azure DevOps at the organization level.
---

Open **Settings → Organization → Source control** to connect version control providers for your organization.

## GitHub

Connect a GitHub App or organization installation to enable:

- Repository pickers in workflows
- PR event triggers
- GitHub agent tools in chat
- Per-project GitHub linking

Follow the in-app connection flow to authorize OpenHarness for your GitHub organization or account.

## Azure DevOps

Connect Azure DevOps as an alternative source control provider for workflows and repository selection.

## Per-project vs organization

- **Organization** connection — Enables org-wide features (workflows, repo lists)
- **Per-project** connection — Links a local folder to a specific repo ([GitHub connection](/workspace/github))

Both may be needed for full workflow automation on a local project.

## Related

- [GitHub connection](/workspace/github)
- [Workflow triggers](/workflows/triggers)
