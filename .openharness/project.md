# Project

## Purpose
OpenHarness is a desktop client for the Pi coding-agent harness, providing an Electron/React chat UI that runs a vendored Pi CLI in RPC mode against selected local projects.

## Tech stack
- TypeScript across the workspace.
- pnpm 10 workspace with Turbo task orchestration.
- Electron + electron-vite for the desktop shell (`apps/desktop`).
- React 19 renderer UI with Tailwind/CSS styling.
- `electron-store` for app preferences and recent project state.
- Vendored Pi monorepo submodule under `vendor/pi`; OpenHarness uses Pi RPC via `pi --mode rpc`.
- OpenRouter is the primary model/API-key integration; Pi also supports its broader provider registry.

## Repo map
- `apps/desktop`: Electron main/preload/renderer application.
  - `src/main`: Electron main process, IPC handlers, Pi process/session management, settings/auth, updates, model catalog helpers.
  - `src/preload`: typed `window.harness` bridge exposed to the renderer.
  - `src/renderer/src`: React chat UI, model switcher, settings panels, timeline/event handling, local conversation storage helpers.
  - `docs`: release and QA notes for desktop-specific workflows.
- `packages/pi-rpc`: JSONL RPC client and shared RPC type definitions used by the desktop app.
- `packages/pi-vendor`: package wrapper that builds the vendored Pi submodule.
- `scripts`: repository scripts for postinstall, Pi runtime staging, Node runtime staging, release/versioning, and vendor checks.
- `vendor/pi`: Pi upstream submodule; important packages include `packages/ai`, `packages/agent`, `packages/coding-agent`, and `packages/tui`.

## Conventions
- Use pnpm workspace filters for package-local tasks.
- Prefer typed IPC contracts in `apps/desktop/src/preload/api.ts` and keep renderer/main types aligned.
- Keep OpenHarness-specific RPC types in `packages/pi-rpc/src/types.ts` aligned with Pi upstream RPC types.
- In development, use the vendored Pi build; packaged apps bundle Pi and a standalone Node runtime.
- OpenRouter API keys are stored in Pi `auth.json` in the active Pi config directory, never in repo files.
- Generated/build outputs include `dist`, `out`, `release`, `resources/*-runtime`, and vendored Pi package `dist` folders; avoid editing generated outputs directly.
- `vendor/pi` is a submodule: upstream Pi changes should be made intentionally and rebuilt/staged when needed.

## Glossary
- **Pi**: Vendored coding-agent harness run by OpenHarness in RPC mode.
- **RPC mode**: Pi JSONL process mode used by the Electron main process.
- **Session key**: OpenHarness runtime key combining project cwd with draft conversation id or Pi session file.
- **OpenRouter key**: Inference API key for the OpenRouter provider, stored in Pi auth.
- **Management key**: Separate OpenRouter key used by OpenHarness to query account credits/usage.
- **Thinking level**: Pi reasoning effort level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`).
- **Swarm mode**: Optional UI mode that enables Pi delegation behavior when supported/configured.

## Update rules
Update when project purpose, stack, repo layout, conventions, or project terminology changes.
