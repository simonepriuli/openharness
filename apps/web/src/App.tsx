import { useEffect, useMemo, useState } from "react";
import {
  detectPlatform,
  fetchLatestRelease,
  LATEST_RELEASE_PAGE_URL,
  pickAssetForPlatform,
  platformLabel,
  RELEASES_PAGE_URL,
  type LatestRelease,
  type Platform,
} from "./github";

type ReleaseState =
  | { status: "loading" }
  | { status: "ready"; release: LatestRelease }
  | { status: "error" };

const FEATURES = [
  {
    title: "Bring your own models",
    body: "Connect OpenRouter, Anthropic and OpenAI, or run fully local with LM Studio and Ollama.",
  },
  {
    title: "Native desktop app",
    body: "A fast, native coding-agent client, bundled and ready to run out of the box.",
  },
  {
    title: "Private by default",
    body: "Your keys and sessions stay in an isolated profile on your machine.",
  },
];

export function App(): React.JSX.Element {
  const [state, setState] = useState<ReleaseState>({ status: "loading" });
  const platform = useMemo<Platform>(() => detectPlatform(), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchLatestRelease(controller.signal)
      .then((release) => setState({ status: "ready", release }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load latest release", err);
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  const asset =
    state.status === "ready"
      ? pickAssetForPlatform(state.release.assets, platform)
      : undefined;

  const downloadUrl =
    asset?.browser_download_url ??
    (state.status === "ready"
      ? state.release.html_url
      : LATEST_RELEASE_PAGE_URL);

  const version =
    state.status === "ready" ? state.release.tag_name : undefined;

  const buttonLabel = (() => {
    if (state.status === "loading") return "Loading…";
    if (asset) return `Download for ${platformLabel(platform)}`;
    return "Download from GitHub";
  })();

  return (
    <div className="flex min-h-full flex-col bg-black text-white">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5 font-medium tracking-tight">
          <img src="/icon.png" alt="OpenHarness" className="h-7 w-7" />
          OpenHarness
        </div>
        <a
          href="https://github.com/simonepriuli/openharness"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-white/50 transition-colors hover:text-white"
        >
          GitHub
        </a>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <img
          src="/icon.png"
          alt=""
          aria-hidden="true"
          className="mb-10 h-20 w-20"
        />

        <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Your coding agent,
          <br />
          on the desktop
        </h1>

        <p className="mt-6 max-w-md text-pretty text-lg text-white/50">
          An open-source desktop app that runs your coding agent locally — with
          your own models and your own keys.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <a
            href={downloadUrl}
            target={asset ? undefined : "_blank"}
            rel={asset ? undefined : "noreferrer"}
            aria-disabled={state.status === "loading"}
            className={`inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-base font-medium text-black transition-opacity hover:opacity-90 ${
              state.status === "loading" ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <DownloadIcon />
            {buttonLabel}
          </a>

          <p className="text-sm text-white/40">
            {version ? (
              <>
                {version}
                {asset ? (
                  <> · {formatBytes(asset.size)}</>
                ) : platform !== "unknown" ? (
                  <> · no {platformLabel(platform)} build in this release</>
                ) : null}
              </>
            ) : state.status === "error" ? (
              "Couldn't reach GitHub — see all releases instead."
            ) : (
              "Fetching the latest version…"
            )}
          </p>

          <a
            href={RELEASES_PAGE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-white/40 underline-offset-4 hover:text-white hover:underline"
          >
            All releases & other platforms
          </a>
        </div>

        <section className="mt-28 grid w-full gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-left sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="bg-black p-6">
              <h3 className="text-sm font-medium text-white">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/45">
                {feature.body}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-6 py-10 text-center text-sm text-white/30">
        Open source ·{" "}
        <a
          href="https://github.com/simonepriuli/openharness"
          target="_blank"
          rel="noreferrer"
          className="hover:text-white"
        >
          simonepriuli/openharness
        </a>
      </footer>
    </div>
  );
}

function DownloadIcon(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}
