export const REPO_OWNER = "simonepriuli";
export const REPO_NAME = "openharness";

export const RELEASES_PAGE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;
export const LATEST_RELEASE_PAGE_URL = `${RELEASES_PAGE_URL}/latest`;

const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

export type Platform = "mac" | "windows" | "linux" | "unknown";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface LatestRelease {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "unknown";
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case "mac":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return "your platform";
  }
}

const PLATFORM_EXTENSIONS: Record<Exclude<Platform, "unknown">, string[]> = {
  // Prefer installers over archives where possible.
  mac: [".dmg", ".pkg", ".zip"],
  windows: [".exe", ".msi"],
  linux: [".appimage", ".deb", ".rpm", ".tar.gz"],
};

/**
 * Pick the most appropriate installer asset for the given platform.
 * Returns undefined when no asset matches (e.g. unknown platform or a
 * release that has no binary for it).
 */
export function pickAssetForPlatform(
  assets: ReleaseAsset[],
  platform: Platform,
): ReleaseAsset | undefined {
  if (platform === "unknown") return undefined;
  const extensions = PLATFORM_EXTENSIONS[platform];
  for (const ext of extensions) {
    const match = assets.find((asset) =>
      asset.name.toLowerCase().endsWith(ext),
    );
    if (match) return match;
  }
  return undefined;
}

export async function fetchLatestRelease(
  signal?: AbortSignal,
): Promise<LatestRelease> {
  const res = await fetch(LATEST_RELEASE_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`GitHub API responded with ${res.status}`);
  }
  return (await res.json()) as LatestRelease;
}
