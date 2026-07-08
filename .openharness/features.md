# Features

## Feature map

- Desktop chat workspace: `apps/desktop/src/renderer/src/App.tsx`, timeline/event helpers in `events.ts`, chat components under `components/`. Assistant response actions live in `components/timeline/AssistantMessageActions.tsx` and `TimelineRows.tsx`.
- Project and conversation navigation: renderer storage/runtime helpers in `lib/chat-storage.ts`, `lib/conversation-runtime.ts`; main session listing in `src/main/sessions.ts`.
- Pi session management: `apps/desktop/src/main/pi-service.ts`, `packages/pi-rpc/src/client.ts`, upstream RPC mode in `vendor/pi/packages/coding-agent/src/modes/rpc`. Assistant-response forking uses Pi RPC `fork_at_entry` plus entry-ID-aware message loading.
- Model selection and thinking mode: `components/ModelSwitcher.tsx`, `lib/model-display.ts`, main `setModel`/`setThinkingLevel` IPC, Pi model registry and thinking-level logic in `vendor/pi/packages/ai/src/models.ts` and `vendor/pi/packages/coding-agent/src/core/agent-session.ts`.
- OpenRouter settings and account usage: `src/main/pi-auth.ts`, `src/main/openrouter-management.ts`, settings UI under `components/settings/`.
- OpenRouter model catalog/custom visible models: `src/main/model-catalog.ts`, `harness:listOpenRouterModels` in main, model display helpers in renderer.
- Composer input, file mentions, images: `components/Composer.tsx`, `lib/composer-draft.ts`, `lib/file-mention.ts`, `src/main/file-search.ts`.
- Tool activity and file edit display: `ToolActivity.tsx`, `ToolLine.tsx`, `FileEditsSummary.tsx`, `src/main/enrich-tool-event.ts`, `src/main/git-line-stats.ts`.
- Swarm mode UI/settings: menu action handling in `App.tsx`, settings panels, `setSwarmMode` in `pi-service.ts`, Pi swarm dispatch tool upstream.
- Packaging/release: `electron-builder.yml`, `scripts/stage-pi-runtime.mjs`, `scripts/stage-node-runtime.mjs`, `scripts/release.mjs`, `apps/desktop/docs/RELEASING.md`.

## Ownership boundaries

- Renderer UI changes should stay under `apps/desktop/src/renderer/src` unless they require IPC/main behavior.
- Main-process behavior, settings, native APIs, and external service calls belong under `apps/desktop/src/main`.
- Renderer/main contracts belong in `apps/desktop/src/preload/api.ts` and `index.ts`; update both sides together.
- Pi protocol/client changes belong in `packages/pi-rpc` plus corresponding upstream Pi RPC changes if commands/events change.
- Provider/model/thinking semantics primarily belong in `vendor/pi/packages/ai` and Pi coding-agent/session code, not only in OpenHarness UI.

## Common change paths

- Add or change a chat control: edit React component, update CSS, add/adjust preload API if it calls main, then wire main IPC to `PiSessionManager` or another service.
- Add a Pi RPC command: update upstream Pi RPC types/handler, `packages/pi-rpc/src/types.ts`, `PiSessionManager`, preload API, and renderer caller.
- Change model/thinking behavior: inspect Pi `getSupportedThinkingLevels`, model `thinkingLevelMap`, provider request formatting, then adjust `ModelSwitcher` UI logic and types as needed.
- Add OpenRouter settings data: add main fetch/storage code, extend `HarnessSettings`, expose via settings IPC, then render in settings UI.
- Change packaging: update stage scripts, builder config, and release docs; verify packaged runtime resources.
- Add tests: prefer package-local TypeScript/vitest tests where existing; run focused checks before full workspace typecheck.

## Known edge cases

- OpenRouter model IDs may contain colons (for example `:free` variants); model parsing must not blindly split provider/model ids except where Pi's model-pattern parser already handles thinking-level suffixes.
- Some reasoning models cannot disable thinking (`thinkingLevelMap.off === null`) and Pi clamps/locks effective levels.
- Pi supports more than a boolean thinking switch; OpenHarness currently presents a boolean toggle that maps on → `high` or sometimes `xhigh`, off → `off`.
- Dynamic OpenRouter model metadata may not fully describe provider-specific reasoning levels; Pi's static/generated model registry is the source used by active sessions.
- Session file creation can rekey runtime identifiers from draft keys to file keys; renderer callers must sync state after Pi operations. Forking a historical assistant response mutates the active Pi process to a new session file, so the renderer must persist the original conversation first and create a distinct local conversation id for the fork.
- Packaged apps use bundled Pi and Node runtime, not a user-global Pi install.

## Update rules

Update when user-visible features, feature ownership, common change paths, or important edge cases change.