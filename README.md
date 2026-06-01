# OpenHarness

Desktop client for the [Pi coding agent](https://pi.dev/) harness via RPC.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)
- Pi installed globally: `npm install -g @earendil-works/pi-coding-agent`
- API credentials configured (`pi` and `/login`, or provider API keys)

## Development

```bash
pnpm install   # requires Electron postinstall (see .npmrc)
pnpm dev
```

On first clone, `pnpm install` must run Electron’s postinstall script. The repo’s [`.npmrc`](.npmrc) allows `electron` and `esbuild` build scripts automatically.

This starts the Electron app (`apps/desktop`). Use **Open folder** to pick a project directory, then chat with Pi.

### Environment

| Variable | Description |
|----------|-------------|
| `PI_BIN` | Path to the `pi` executable (default: `pi` on `PATH`) |

## Workspace

| Package | Description |
|---------|-------------|
| `apps/desktop` | Electron + React UI |
| `packages/pi-rpc` | JSONL RPC client for `pi --mode rpc` |

## Scripts

- `pnpm dev` — run desktop app in dev mode
- `pnpm build` — build all packages
- `pnpm typecheck` — TypeScript check across workspace
