# Architecture

## Runtime architecture

- The Electron main process (`apps/desktop/src/main/index.ts`) owns windows, native menus, IPC handlers, settings, auth files, updater integration, and Pi subprocess/session lifecycle.
- The preload bridge (`apps/desktop/src/preload/index.ts`, `api.ts`) exposes a typed `window.harness` API to the renderer with context isolation enabled.
- The React renderer (`apps/desktop/src/renderer/src`) owns chat UI state, project/conversation navigation, composer input, model switching, settings panels, and timeline rendering.
- `PiSessionManager` (`apps/desktop/src/main/pi-service.ts`) spawns vendored Pi with `--mode rpc`, multiplexes up to five active sessions, forwards Pi events to the renderer, and serializes per-session operations.
- `packages/pi-rpc` wraps the JSONL process protocol used to send commands and receive events/responses from Pi.
- The vendored Pi submodule provides model/provider registry, agent loop, tools, session persistence, and RPC command implementation.

## Data and control flow

- Project open: renderer requests directory selection; main stores recent cwd, ensures `.openharness/`, warms file search, and starts/attaches a Pi RPC session for the project.
- Prompt send: renderer calls `window.harness.prompt`; main sends a Pi RPC `prompt`; Pi streams agent/tool/message events; main enriches selected tool events and forwards envelopes to the renderer; renderer updates timeline and persists conversation state.
- Session restore: renderer tracks local conversation summaries; main can query Pi session files; `get_messages`, `get_messages_with_entry_ids`, and `get_state` rehydrate messages, stable timeline entry ids, and session metadata.
- Model switch: renderer calls `setModel`; main sends Pi RPC `set_model`; Pi validates availability/auth, updates session/default model, clamps thinking level to the new model capabilities, and emits model selection events.
- Thinking mode: renderer calls `setThinkingLevel`; main sends Pi RPC `set_thinking_level`; Pi clamps against provider/model `thinkingLevelMap` and persists the effective level in session/settings.
- Settings/auth: renderer calls settings IPC; main reads/writes app preferences via `electron-store`, OpenRouter inference credentials via Pi `auth.json`, and management key via `openrouter-management.json` in app user data.

## Boundaries and contracts

- IPC boundary: `apps/desktop/src/preload/api.ts` defines the renderer-facing contract; main handlers in `index.ts` must return compatible shapes.
- Pi RPC boundary: `packages/pi-rpc/src/types.ts` mirrors the subset of upstream `vendor/pi/packages/coding-agent/src/modes/rpc/rpc-types.ts` used by OpenHarness, including OpenHarness-exposed session branching commands such as `fork_at_entry`.
- Auth boundary: Pi provider credentials live in the active Pi config dir (`auth.json`); OpenHarness-specific management credentials live under Electron user data.
- Filesystem boundary: user project data belongs in the selected project; OpenHarness app state belongs in Electron user data; vendored Pi runtime is staged for packaged builds.
- Provider boundary: OpenRouter model inference uses Pi provider definitions; OpenHarness only directly queries OpenRouter for model listing, credits, and title generation.

## External systems

- OpenRouter API: inference through Pi, model listing (`/api/v1/models`), key info (`/api/v1/key`), credits (`/api/v1/credits`), and title generation chat completions.
- Electron auto-update/release infrastructure via `electron-updater` and `electron-builder`.
- Pi upstream submodule at `vendor/pi`.
- Node runtime downloaded/staged for packaged apps.

## Critical invariants

- The renderer must only access native capabilities through the preload `window.harness` API.
- Every active Pi process must be stopped/restarted when settings/auth changes require new configuration.
- Session rekeying must preserve continuity when a draft session becomes a Pi session file or when a fork creates a new branched session file.
- `packages/pi-rpc` command/event types must stay compatible with vendored Pi RPC implementation.
- OpenRouter API keys and management keys must never be committed or written into project files.
- Do not edit generated outputs (`out`, `dist`, release artifacts) as the source of truth.

## Update rules

Update on architecture, process boundaries, IPC/RPC contracts, external integration, persistence, or invariant changes.