# Releasing OpenHarness

OpenHarness ships desktop builds via GitHub Releases. Tagged pushes trigger
[`.github/workflows/release.yml`](../../.github/workflows/release.yml), which builds
macOS, Windows, and Linux installers and publishes update metadata for
`electron-updater`.

## Cut a release

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

## Code signing (recommended for production)

Unsigned builds can be used to test the updater plumbing, but macOS Gatekeeper
and auto-update work best with signed, notarized builds.

Configure these GitHub Actions **repository secrets** when you are ready:

| Secret | Purpose |
|--------|---------|
| `CSC_LINK` | Base64-encoded `.p12` signing certificate (macOS and Windows) |
| `CSC_KEY_PASSWORD` | Password for the certificate |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

The workflow passes them through to `electron-builder` automatically when set.
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
