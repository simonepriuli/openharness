# web

Landing page for OpenHarness. A Vite + React + Tailwind app whose primary call
to action downloads the latest desktop build from
[GitHub Releases](https://github.com/simonepriuli/openharness/releases).

## Scripts

```bash
pnpm --filter web dev        # local dev server
pnpm --filter web build      # typecheck + production build to dist/
pnpm --filter web preview    # preview the production build
pnpm --filter web typecheck  # type check only
```

## How the download button works

On load the page calls the GitHub Releases API
(`/repos/simonepriuli/openharness/releases/latest`), detects the visitor's OS,
and picks the matching installer asset (`.dmg` for macOS, `.exe` for Windows,
`.AppImage`/`.deb` for Linux). If the platform can't be detected or the API is
unreachable, the button falls back to the latest release / releases page on
GitHub. See [`src/github.ts`](src/github.ts).
