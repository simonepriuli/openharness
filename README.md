# OpenHarness

Desktop client for the [Pi coding agent](https://pi.dev/) harness via RPC.

Pi is vendored as a git submodule at [`vendor/pi`](vendor/pi) (upstream: [earendil-works/pi](https://github.com/earendil-works/pi)). OpenHarness builds and runs that copy in RPC mode—no global `pi` install required for development.

## Prerequisites

- Node.js **22.19+** (matches Pi)
- [pnpm](https://pnpm.io/) 10.11+
- API credentials configured for Pi (`pi` and `/login`, or provider API keys in `~/.pi`)

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

### Environment

| Variable | Description |
|----------|-------------|
| `PI_BIN` | Path to the `pi` executable (overrides vendored and global resolution) |
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
- `pnpm typecheck` — TypeScript check across workspace
