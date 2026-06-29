# Cloud Worker

Long-running Node process that executes cloud-resolved workflow runs via `@openharness/workflow-executor`.

**Local dev** uses a poll loop (`pnpm dev:cloud-worker`). **Production** dispatches one Vercel Sandbox VM per run from the API when sandbox dispatch is configured.

## Environment

| Variable | Required | Default |
|----------|----------|---------|
| `OPENHARNESS_API_URL` | yes | — |
| `CLOUD_WORKER_SECRET` | yes | must match API `CLOUD_WORKER_SECRET` |
| `CLOUD_WORKER_ID` | no | `hostname-pid` |
| `OPENHARNESS_REPOS_ROOT` | no | `/tmp/openharness/repos` |
| `OPENHARNESS_WORKTREES_ROOT` | no | `/tmp/openharness/worktrees` |
| `OPENHARNESS_ROOT` | no | repo root for vendored Pi |
| `OPENHARNESS_SUMMARIZATION_MODEL` | no | `openrouter/anthropic/claude-sonnet-4` |
| `VERCEL_SANDBOX_ID` | sandbox only | set by API dispatch for timeout extension |
| `RUN_ID` / `ORGANIZATION_ID` | run-once only | set by API dispatch |

## Local dev (poll mode)

**Terminal 1** — API (reads `apps/api/.env`, including `CLOUD_WORKER_SECRET`):

```bash
pnpm dev:api
```

**Terminal 2** — Cloud worker (auto-loads `apps/api/.env` via `--env-file`):

```bash
OPENHARNESS_ROOT=$PWD pnpm dev:cloud-worker
```

`OPENHARNESS_API_URL` is optional if `BETTER_AUTH_URL` is set in `apps/api/.env` (defaults to `http://127.0.0.1:3001` after normalization).

Override inline if needed:

```bash
OPENHARNESS_API_URL=http://127.0.0.1:3001 \
OPENHARNESS_ROOT=$PWD \
pnpm dev:cloud-worker
```

## Manual E2E checklist

1. Set `CLOUD_WORKER_SECRET` on API and cloud-worker.
2. Enable **Cloud workers** on the org (Settings → Organization).
3. Configure org cloud provider secrets (OpenRouter/Anthropic, etc.).
4. Create a manual workflow with `executionTarget: cloud`.
5. Quit the desktop app and trigger the workflow.
6. Confirm the run completes with the **Cloud** badge in Workflows → Runs.
7. Reopen the run in desktop — timeline loads from persisted events.
8. Repeat with a PR workflow using `prComment` / `prApprove` / `prPush` tools.

## Production (Vercel Sandbox dispatch)

When the API runs on Vercel with `VERCEL=1`, `CLOUD_WORKER_SECRET`, `CLOUD_WORKER_SNAPSHOT_ID`, and a matching `CLOUD_WORKER_BUNDLE_FINGERPRINT`, cloud workflow enqueues dispatch a sandbox instead of waiting for a local poller.

The API embeds the expected bundle fingerprint at build time. If production env vars lag behind a deploy (for example while the snapshot workflow is still running), sandbox dispatch stays disabled until the fingerprint matches — stale snapshots cannot run silently.

### Automated snapshot CI (primary path)

Pushes to `main` that touch cloud-worker bundle inputs trigger [`.github/workflows/cloud-worker-snapshot.yml`](../../.github/workflows/cloud-worker-snapshot.yml):

1. Compute a content fingerprint of bundle inputs.
2. Skip rebuild when production `CLOUD_WORKER_BUNDLE_FINGERPRINT` already matches.
3. Stage the bundle in CI, upload to a Vercel Sandbox, verify, and snapshot.
4. Update production `CLOUD_WORKER_SNAPSHOT_ID` and `CLOUD_WORKER_BUNDLE_FINGERPRINT`.
5. Redeploy production so the new env vars are live.

**GitHub repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Team-scoped personal access token with env + deploy access |
| `VERCEL_TEAM_ID` | Team Settings → General |
| `VERCEL_PROJECT_ID` | API project Settings → General |

**Bootstrap:** run the workflow manually via **Actions → Cloud Worker Snapshot → Run workflow** if you already have a snapshot but no fingerprint env var yet.

### Local snapshot script (debugging)

From the repo root, with Vercel auth in `apps/api/.env.local`:

```bash
pnpm stage:cloud-worker
pnpm --filter api snapshot:cloud-worker
```

**Where to put credentials** — create `apps/api/.env.local` (gitignored). Two options:

**Option A (recommended):** OIDC via Vercel CLI

```bash
cd apps/api
vercel link          # select your API project
vercel env pull .env.local
cd ../..
pnpm --filter api snapshot:cloud-worker
```

Re-run `vercel env pull .env.local` if the token expires (~12 hours).

**Option B:** Personal access token in `apps/api/.env.local`:

```bash
VERCEL_TOKEN=...        # https://vercel.com/account/settings/tokens (scoped to your team)
VERCEL_TEAM_ID=...      # Team Settings → General
VERCEL_PROJECT_ID=...   # API project Settings → General
```

Copy the printed `CLOUD_WORKER_SNAPSHOT_ID` and `CLOUD_WORKER_BUNDLE_FINGERPRINT` into the Vercel project env for the API.

### Verify production

1. Confirm production has `CLOUD_WORKER_SNAPSHOT_ID`, `CLOUD_WORKER_BUNDLE_FINGERPRINT`, and `CLOUD_WORKER_SECRET`.
2. Enable **Cloud workers** on the org and configure org cloud secrets.
3. Trigger a cloud workflow with the desktop app closed.
4. Confirm the run moves `pending` → `claimed` → `done` without `pnpm dev:cloud-worker`.
5. Check the Vercel Sandbox dashboard for per-run VMs.

Local API + `pnpm dev:cloud-worker` still works without `CLOUD_WORKER_SNAPSHOT_ID` (poll path unchanged).
