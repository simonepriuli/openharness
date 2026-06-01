export const isMacUA =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);

export const electronMacVibrancy =
  typeof window !== "undefined" && window.harness.nativeVibrancyEnabled === true;

export const mainSidebarToggleDelayMs = 120;

/** Clears macOS traffic lights when the sidenav is collapsed (main-panel reopen control). */
export const macTitlebarGutterClass = "w-[78px] shrink-0 self-stretch";

/** Sidenav open: ~one traffic-light gap after the green button (azrev pl-[76px]). */
export const macTitlebarGutterSidebarClass = "w-[76px] shrink-0 self-stretch";

/** macOS hiddenInset titlebar is ~38px; h-11 (44px) centers content below the lights. */
export function titlebarRowClass(isMac: boolean): string {
  return isMac
    ? "app-region-drag flex h-[38px] shrink-0 items-center"
    : "app-region-drag flex h-11 shrink-0 items-center";
}

/** Fine-tune vertical center against macOS hiddenInset traffic lights. */
export const macTitlebarContentOffsetClass = "translate-y-[1px]";

export const popoverSurface =
  "rounded-2xl border border-[#EEEEEE] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.08)]";
export const textPrimary = "text-[#1A1A1A]";
export const textHeaderLabel = "text-[#A9A9AA]";
export const rowHover = "rounded-lg hover:bg-slate-900/5";
export const panelRow = "flex h-8 min-h-8 max-h-8 w-full shrink-0 items-center gap-3 px-3";
export const iconPrimary = "text-[#1A1A1A]";
export const iconMuted = "text-[#737373]";
