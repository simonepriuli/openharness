# Releasing OpenHarness

OpenHarness ships desktop builds via GitHub Releases. Tagged pushes trigger
[`.github/workflows/release.yml`](../../.github/workflows/release.yml), which builds
macOS, Windows, and Linux installers and publishes update metadata for
`electron-updater`.

## Cut a release

### Option A — release scripts (recommended)

From `main` with a clean working tree:

```bash
pnpm release:patch   # 0.1.0 -> 0.1.1
pnpm release:minor   # 0.1.0 -> 0.2.0
pnpm release:major   # 0.1.0 -> 1.0.0
```

Each script:

1. Reads the latest `v*` git tag (or starts from `0.0.0`)
2. Bumps `apps/desktop/package.json`
3. Commits, tags, pushes `main`, and pushes the tag
4. Triggers the Release workflow

Dry run (no git changes):

```bash
node scripts/release.mjs --dry-run patch
```

### Option B — manual tag

1. Ensure `main` is ready and CI is green.
2. Tag with semver (the `v` prefix is required):

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. The release workflow sets `apps/desktop/package.json` version from the tag,
   builds Pi, packages the app, and uploads artifacts plus `latest*.yml` files.
4. Installed apps check GitHub Releases on launch and show **Install update**
   when a newer build has finished downloading.

## Auto-update requirements

The repository must be **public** (or use a GitHub PAT for private-repo testing).

Each release must include macOS update artifacts uploaded by CI:

- `latest-mac.yml`
- `OpenHarness-X.Y.Z-mac.zip`

If the macOS Release job fails, you may get a `.dmg` from an older partial publish
but **Check for updates** will not work. On the release page, confirm those files
exist under **Assets** before testing the updater.

## Code signing (required for macOS in-app install)

Unsigned builds can be installed manually (right-click → Open), and **Check for updates**
can download a newer version, but macOS **blocks the Install button** unless both the
installed app and the update are signed with the same Apple Developer certificate.
You will see errors like `Code signature ... did not pass validation` from ShipIt.

Until signing is configured, install updates by downloading the `.dmg` from
[GitHub Releases](https://github.com/simonepriuli/openharness/releases).

Configure these GitHub Actions **repository secrets** when you are ready:

| Secret | Purpose |
|--------|---------|
| `CSC_LINK` | Base64-encoded `.p12` signing certificate (macOS and Windows) |
| `CSC_KEY_PASSWORD` | Password for the certificate |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

The workflow passes them through to `electron-builder` automatically when set.
If the secrets are absent, the workflow builds **unsigned** installers instead
(empty GitHub secrets must not be passed as `CSC_LINK=""`, which breaks the build).
macOS entitlements live in [`build/entitlements.mac.plist`](../build/entitlements.mac.plist).
When signing, add to `electron-builder.yml` under `mac:`:

```yaml
hardenedRuntime: true
entitlements: build/entitlements.mac.plist
entitlementsInherit: build/entitlements.mac.plist
```

## Local packaging

```bash
pnpm dist        # full installers (builds @openharness/pi-rpc first)
pnpm dist:dir    # unpacked app (no publish)
```

The release workflow also runs `pnpm --filter @openharness/pi-rpc build` before packaging.

Auto-update is disabled in dev and unpacked local builds unless
`OPENHARNESS_ENABLE_UPDATER=1` is set.

## Testing updates

1. Install release `v1.0.0` from GitHub Releases.
2. Tag and publish `v1.0.1`.
3. Launch the `v1.0.0` app; after download completes, click **Install update**
   in the title bar.
