import type { AppTheme } from "../../../preload/api";

const THEME_STORAGE_KEY = "openharness.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function isAppTheme(value: unknown): value is AppTheme {
  return value === "system" || value === "light" || value === "dark";
}

export function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isAppTheme(stored) ? stored : "system";
}

export function storeTheme(theme: AppTheme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function themeResolvesToDark(theme: AppTheme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return (
    typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches
  );
}

export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  const dark = themeResolvesToDark(theme);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Re-apply the theme from local storage (respects system / light / dark). */
export function syncThemeFromStorage(): void {
  applyTheme(getStoredTheme());
}

/**
 * When appearance is "system", re-sync the `dark` class whenever the OS toggles.
 * Call once at app startup (main workspace is not mounted in Settings).
 */
export function subscribeToSystemTheme(onChange?: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(DARK_QUERY);
  const handler = () => {
    if (getStoredTheme() !== "system") return;
    applyTheme("system");
    onChange?.();
  };
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}

/** Load theme from persisted settings and keep renderer + storage aligned. */
export async function hydrateThemeFromSettings(): Promise<void> {
  if (typeof window === "undefined" || typeof window.harness === "undefined") return;
  const settings = await window.harness.getSettings();
  storeTheme(settings.theme);
  applyTheme(settings.theme);
}
