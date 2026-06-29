---
title: Create a workflow
description: Configure workflow name, model, instructions, and execution settings.
---

Create workflows from the **Overview** tab in the workflows workspace.

## Creating a new workflow

1. Open **Workflows** in the sidebar
2. Click **Create workflow** (or use a [template](/workflows/templates))
3. Fill in the editor fields
4. Click **Save**

## Editor fields

| Field | Description |
|-------|-------------|
| **Name** | Display name for the workflow |
| **Enabled** | Toggle to activate or pause |
| **Local only** | When on, workflow runs only on your machine; when off, shared with the organization |
| **Execution target** | Auto (prefer cloud), Cloud, or Local — see [Execution targets](/workflows/execution) |
| **Repository & branch** | GitHub or Azure DevOps repo and target branch |
| **Model** | AI model for the workflow run |
| **Instructions** | Agent prompt describing what the workflow should do |
| **Triggers** | Events that start a run — see [Triggers](/workflows/triggers) |
| **Tools** | GitHub PR actions and notification toggles |
| **Notifications** | Teams or Discord notify when configured |

## GitHub action toggles

When PR triggers are configured and the GitHub agent is ready:

| Toggle | Action |
|--------|--------|
| Review PR | Post review comments |
| Approve PR | Approve the pull request |
| Create PR | Open a new pull request |
| Push branch | Commit and push changes |

## Manual run

Click the **Play** button to trigger a workflow immediately without waiting for an event.

## Delete

Use the delete action in the workflow editor to remove a workflow permanently.

## Related

- [Triggers](/workflows/triggers)
- [Templates](/workflows/templates)
- [Execution targets](/workflows/execution)
