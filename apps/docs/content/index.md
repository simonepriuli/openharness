---
title: OpenHarness Documentation
description: Learn how to use OpenHarness — your coding agent on the desktop.
startHereCards:
  - title: Quickstart
    description: Download, sign in, open a project, and send your first message.
    href: /quickstart
  - title: Sign in & organizations
    description: GitHub login, joining or creating an organization.
    href: /sign-in
  - title: Keyboard shortcuts
    description: Speed up your workflow with shortcuts for chat, navigation, and modes.
    href: /keyboard-shortcuts
featureCards:
  - title: Understand your code
    description: Ask questions about your codebase, explore files, and get explanations with @ file mentions.
    href: /chat/mentions
  - title: Plan and build features
    description: Use Plan mode to interview, draft a plan, and implement it step by step.
    href: /chat/plan-mode
  - title: Find and fix bugs
    description: Describe issues, review git changes, and let the agent investigate and patch code.
    href: /panel/changes
  - title: Review changes
    description: See file edits, tool activity, and git diffs in the right panel and timeline.
    href: /chat/timeline
  - title: Customize OpenHarness
    description: Configure models, providers, swarm defaults, and organization settings.
    href: /settings/general
  - title: Automate with workflows
    description: Run PR reviews, CVE scans, and bug triage on a schedule or when events fire.
    href: /workflows/overview
---

OpenHarness is a desktop application that runs a powerful coding agent on your machine. It helps you understand code, plan features, fix bugs, review changes, and automate repetitive tasks — all with the models and API keys you choose.

This documentation covers **For coding** mode, the default experience for software development. OpenHarness groups your work by project, keeps conversations per repository, and gives you a full chat workspace with optional Plan and Swarm modes.

## What is For coding mode?

For coding mode is optimized for developers working in local repositories. You get:

- A **Repositories** sidebar with projects and conversations
- **Plan** and **Swarm** composer modes for structured work and parallel sub-agents
- A **right panel** with Files, Changes, and Plan tabs
- **Workflows** for automated PR reviews, scans, and integrations

You can switch work modes in **Settings → General**, but this guide assumes you are using **For coding**.

## Before you start

You need:

1. An OpenHarness account (sign in with GitHub)
2. Membership in an organization
3. At least one model provider configured (org secrets, OAuth subscription, or local server)

See [Quickstart](/quickstart) to get running in a few minutes.

<!-- image: screenshot of main workspace -->
