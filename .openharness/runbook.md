# Runbook

## Setup
- Required: Node.js 22.19+ and pnpm 10.11+.
- Clone with submodules: `git clone --recurse-submodules <repo>`; if already cloned, run `git submodule update --init --recursive`.
- Install dependencies: `pnpm install`.
- `pnpm install` runs `pnpm build:pi` via postinstall unless `OPENHARNESS_SKIP_PI_BUILD=1` is set.
- Configure an OpenRouter API key in app settings (`Workspace → Settings → API`) or through Pi auth configuration.

## Environment variables
- `PI_BIN`: override Pi executable path.
- `PI_NODE`: Node binary used to run vendored Pi CLI.
- `OPENHARNESS_ROOT`: root for resolving vendored Pi CLI.
- `OPENHARNESS_SKIP_PI_BUILD=1`: skip Pi build during install.
- `OPENHARNESS_ENABLE_HARDWARE_ACCELERATION=1`: opt into Electron hardware acceleration.
- `OPENHARNESS_DISABLE_NATIVE_VIBRANCY=1`: disable macOS native vibrancy.

## Run commands
- `pnpm dev`: run desktop app in development mode; Turbo builds Pi first.
- `pnpm build:pi`: build vendored Pi CLI/runtime only.
- `pnpm stage:pi`: copy Pi runtime into desktop resources for packaging.
- `pnpm stage:node`: download/stage standalone Node runtime for packaging.

## Test commands
- `pnpm typecheck`: TypeScript check across the workspace.
- `pnpm build`: build all workspace packages/apps.
- Package-local checks can be run with pnpm filters, e.g. `pnpm --filter desktop typecheck` or package-specific test scripts where available.
- Pi upstream packages include vitest tests under `vendor/pi/packages/*/test`; run focused tests from the relevant package when changing Pi internals.

## Build/release
- Development build: `pnpm build`.
- Distribution: `pnpm build:pi` then `pnpm dist`.
- Desktop installers output under `apps/desktop/release/`.
- For unpacked packaged testing, use the desktop package `dist:dir` script (`pnpm --filter desktop dist:dir`).
- Release/version workflow is scripted by `scripts/release.mjs` and desktop release docs.

## Troubleshooting
- If Pi RPC cannot start, verify the vendored Pi build (`pnpm build:pi`) and submodule checkout.
- If OpenRouter models/auth are missing, verify `auth.json` under app user data (`…/OpenHarness/pi/agent/auth.json` on macOS).
- If settings/auth changes do not take effect, restart active Pi sessions; OpenHarness `restartAll` is intended for config/auth refresh.
- If packaged app inference fails, verify `stage:pi` and `stage:node` completed and resources are included in the app bundle.
- If renderer/native visual glitches occur on macOS, try disabling native vibrancy or leaving hardware acceleration off.

## Update rules
Update when setup, commands, environment variables, test strategy, release flow, or troubleshooting changes.
