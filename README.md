# OpenHarness

Desktop client for the [Pi coding agent](https://pi.dev/) harness via RPC.

Pi is vendored as a git submodule at [`vendor/pi`](vendor/pi) (upstream: [earendil-works/pi](https://github.com/earendil-works/pi)). OpenHarness builds and runs that copy in RPC mode—no global `pi` install required for development.

## Prerequisites

- Node.js **22.19+** (matches Pi)
- [pnpm](https://pnpm.io/) 10.11+
- A **model provider** configured in the app (recommended): **Settings → Cloud providers** or **Settings → Local providers** for API keys and local servers (OpenRouter, Anthropic, OpenAI, LM Studio, Ollama, etc.). You can also configure Pi credentials another way (see below)

### Optional: your own Pi fork

To customize Pi internals, fork [earendil-works/pi](https://github.com/earendil-works/pi) on GitHub, then repoint the submodule:

```bash
# On GitHub: fork earendil-works/pi → <you>/pi
git config -f .gitmodules submodule.vendor/pi.url https://github.com/<you>/pi.git
git submodule sync vendor/pi
cd vendor/pi && git remote add upstream https://github.com/earendil-works/pi.git
```

Sync with upstream periodically:

```bash
cd vendor/pi
git fetch upstream
git merge upstream/main
cd ../..
git add vendor/pi && git commit -m "chore: bump vendor/pi"
```

### Optional: global Pi on PATH

`npm install -g @earendil-works/pi-coding-agent` still works as a fallback when the vendored CLI is not built.

End users of a **packaged** OpenHarness app do not need Pi installed: the installer bundles a built Pi runtime and a standalone Node binary to run it (no second Dock icon on macOS).

## Development

```bash
git clone --recurse-submodules https://github.com/simonepriuli/openharness.git
cd openharness
# If you already cloned without submodules:
# git submodule update --init --recursive

pnpm install   # builds Pi via postinstall unless skipped
pnpm dev
```

On first clone, `pnpm install` runs `pnpm build:pi` unless `OPENHARNESS_SKIP_PI_BUILD=1` is set. Electron’s postinstall still requires [`.npmrc`](.npmrc) (`electron`, `esbuild` scripts).

Use **Open folder** to pick a project directory, then chat with Pi.

Open **Workspace → Settings** to configure providers and Pi options.

### Pi configuration

OpenHarness keeps Pi config (`auth.json`, `models.json`, sessions) in app user data (for example `~/Library/Application Support/OpenHarness/pi/agent` on macOS), separate from a terminal `pi` CLI install.

Cloud provider API keys saved in **Settings → Cloud providers** are written to `auth.json` there (never committed to git).

### Model providers

**Cloud providers** — **Settings → Cloud providers** for API keys (OpenRouter, Anthropic, OpenAI, Google Gemini, Groq, Mistral, DeepSeek). Keys are stored in Pi's `auth.json`.

**Local providers** — **Settings → Local providers** for LM Studio, Ollama, and other OpenAI-compatible local servers. Discovered models are written to `models.json`.

You need at least one configured cloud or local provider to send messages. OpenRouter credits and usage use the management key on the OpenRouter card under **Settings → Cloud providers**.

### Environment

| Variable | Description |
|----------|-------------|
| `PI_BIN` | Path to the `pi` executable (overrides vendored and global resolution) |
| `PI_NODE` | Node binary used to run vendored `cli.js` (default: system `node` in dev, bundled Node in packaged builds) |
| `OPENHARNESS_ROOT` | Repo root for resolving `vendor/pi/.../cli.js` (auto-detected when unset) |
| `OPENHARNESS_SKIP_PI_BUILD` | Set to `1` to skip Pi build during `pnpm install` |

### Pi build only

```bash
pnpm build:pi
```

## Workspace

| Package | Description |
|---------|-------------|
| `apps/desktop` | Electron + React UI |
| `packages/pi-rpc` | JSONL RPC client for `pi --mode rpc` |
| `packages/pi-vendor` | Builds the `vendor/pi` submodule via npm |
| `vendor/pi` | Pi monorepo submodule (agent, ai, tui, coding-agent) |

## Scripts

- `pnpm dev` — run desktop app in dev mode (builds Pi first)
- `pnpm build` — build all packages
- `pnpm build:pi` — build vendored Pi CLI only
- `pnpm stage:pi` — copy Pi runtime into `apps/desktop/resources/pi-runtime` for packaging
- `pnpm stage:node` — download Node.js into `apps/desktop/resources/node-runtime` for packaging
- `pnpm dist` — stage Pi, build the app, and produce installers (macOS `.dmg`, etc.)
- `pnpm typecheck` — TypeScript check across workspace

## Distribution

```bash
pnpm build:pi      # if not already built
pnpm dist          # or: pnpm --filter desktop dist:dir  (unpacked app for testing)
```

Installers land in `apps/desktop/release/`. The bundled Pi runtime is copied from `vendor/pi` into the app’s `Resources/pi` (macOS). Configure API keys in the in-app settings (isolated profile by default), not via a separate `pi` install.
