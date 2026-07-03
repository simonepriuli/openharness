---
title: Workflow templates
description: Starting templates for common automation tasks.
---

Templates pre-fill workflow name, instructions, triggers, and tools. Apply a template when creating a workflow, then customize as needed.

## Template categories

Templates are grouped into **Code Review** and **Security**.

## Available templates

### PR review

Automated pull request review. Posts comments on code quality, bugs, and improvements when a PR is opened or updated.

### Comment fixer

Responds to PR review comments by making fixes and pushing updates.

### Dependency CVE scan

Scans project dependencies for known CVEs on a schedule. Results appear in the run detail as a vulnerability table.

### Teams bug triage

Triages bug reports from Microsoft Teams mentions. Summarizes issues and suggests next steps.

### Discord bug triage

Same as Teams bug triage, for Discord channel mentions.

### Linear issue triage

When a new issue is created in a mapped Linear project, investigates the report in the repository and posts findings as a comment on the issue.

### Linear comment reply

When someone comments on a mapped Linear issue, investigates if needed and replies on the issue.

### Linear issue implementation

When a Linear issue is created in a mapped project, implements a focused fix, opens a pull request, and updates the issue with status and links.

## Using a template

1. In the workflow editor, open **Starting templates**
2. Select a category tab
3. Click **Use** on a template card
4. Review and adjust fields
5. Save the workflow

## Related

- [Create a workflow](/workflows/create)
- [Triggers](/workflows/triggers)
- [Runs](/workflows/runs)
