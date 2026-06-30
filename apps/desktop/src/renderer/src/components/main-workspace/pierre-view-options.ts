import { useMemo, type CSSProperties } from "react";
import { useAppDarkMode } from "../../hooks/useAppDarkMode";

export const PIERRE_CONTENT_INSET = "18px";

export const pierreUnsafeCSS = `
  :host {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    --diffs-light-bg: var(--settings-page-bg);
    --diffs-dark-bg: var(--bg);
    background-color: var(--settings-page-bg);
    user-select: text;
    -webkit-user-select: text;
  }

  pre,
  code {
    background-color: var(--settings-page-bg);
    user-select: text;
    -webkit-user-select: text;
  }

  [data-content],
  [data-gutter],
  [data-line] {
    user-select: text;
    -webkit-user-select: text;
  }

  [data-file] {
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  [data-file] [data-code] {
    flex: 1 0 auto;
    align-self: stretch;
    align-content: start;
    grid-auto-rows: max-content;
    min-height: 0;
    padding-top: 0;
  }

  [data-file] [data-gutter],
  [data-file] [data-content],
  [data-diff] [data-gutter],
  [data-diff] [data-content] {
    background-color: var(--settings-page-bg);
  }

  [data-file] [data-gutter],
  [data-diff] [data-gutter] {
    padding-left: var(--project-explorer-content-inset, ${PIERRE_CONTENT_INSET});
  }

  [data-file] [data-column-number],
  [data-diff] [data-column-number] {
    padding-left: 0;
  }
`;

/**
 * Minimal unsafeCSS for the virtualized CodeView diff. Unlike `pierreUnsafeCSS`
 * (which makes a single File fill its container via `flex: 1 0 auto` /
 * `min-height: 100%`), CodeView positions and measures each item itself. Forcing
 * items to grow there fights the virtualizer's height measurement, so we only
 * apply theming/selection/padding here and never any sizing rules.
 */
export const pierreCodeViewUnsafeCSS = `
  :host {
    display: block;
    width: 100%;
    --diffs-light-bg: var(--settings-page-bg);
    --diffs-dark-bg: var(--bg);
    background-color: var(--settings-page-bg);
    padding-left: var(--project-explorer-content-inset, ${PIERRE_CONTENT_INSET});
    user-select: text;
    -webkit-user-select: text;
  }

  pre,
  code {
    background-color: var(--settings-page-bg);
    user-select: text;
    -webkit-user-select: text;
  }

  pre[data-diff],
  pre[data-file] {
    width: 100%;
  }

  [data-content],
  [data-gutter],
  [data-line] {
    user-select: text;
    -webkit-user-select: text;
  }

  /* Pierre defaults to align-self:flex-start so [data-code] shrinks to the longest
   * line. Stretch it to the container width; overflow:scroll still handles wide
   * lines and the 1fr content column absorbs the extra space for line backgrounds.
   *
   * min-width:0 is essential: without it a flex/grid item keeps its default
   * min-width:auto (= min-content), so blocks whose longest line overflows refuse
   * to shrink to the container and end up narrower on the right than short blocks.
   * Forcing min-width:0 lets every block fill the full width regardless of whether
   * it has horizontal scroll. */
  [data-code] {
    width: 100%;
    min-width: 0;
    align-self: stretch;
  }

  [data-file] [data-gutter],
  [data-file] [data-content],
  [data-diff] [data-gutter],
  [data-diff] [data-content] {
    background-color: var(--settings-page-bg);
  }

  /* File items only — diff gutters must keep Pierre's default layout so indicator
   * bars (absolute left:0 on [data-column-number]) sit in the 2ch padding slot
   * instead of overlapping line numbers. */
  [data-file] [data-gutter] {
    padding-left: var(--project-explorer-content-inset, ${PIERRE_CONTENT_INSET});
  }

  [data-file] [data-column-number] {
    padding-left: 0;
  }
`;

export const pierreThemeStyle = {
  display: "flex",
  flexDirection: "column",
  flex: "1 0 auto",
  minHeight: 0,
  width: "100%",
  background: "var(--settings-page-bg)",
  color: "var(--text)",
  "--project-explorer-content-inset": PIERRE_CONTENT_INSET,
  "--diffs-light-bg": "var(--settings-page-bg)",
  "--diffs-dark-bg": "var(--bg)",
} as CSSProperties;

/**
 * CodeView manages its own internal scroll + virtualization, so its host must
 * have a bounded height (NOT content-sized like `pierreThemeStyle`). Using a
 * content-based flex basis here makes CodeView render every line of every file
 * at once, defeating virtualization and tanking performance.
 */
export const pierreCodeViewStyle = {
  height: "100%",
  width: "100%",
  minHeight: 0,
  background: "var(--settings-page-bg)",
  color: "var(--text)",
  "--project-explorer-content-inset": PIERRE_CONTENT_INSET,
  "--diffs-light-bg": "var(--settings-page-bg)",
  "--diffs-dark-bg": "var(--bg)",
} as CSSProperties;

export function usePierreViewOptions() {
  const isDark = useAppDarkMode();

  return useMemo(
    () => ({
      theme: { dark: "pierre-dark" as const, light: "pierre-light" as const },
      themeType: isDark ? ("dark" as const) : ("light" as const),
      overflow: "scroll" as const,
      unsafeCSS: pierreUnsafeCSS,
      style: pierreThemeStyle,
    }),
    [isDark],
  );
}

export function usePierreFileOptions() {
  const base = usePierreViewOptions();

  return useMemo(
    () => ({
      ...base,
      options: {
        theme: base.theme,
        themeType: base.themeType,
        overflow: base.overflow,
        disableFileHeader: true,
        unsafeCSS: base.unsafeCSS,
      },
    }),
    [base],
  );
}

export function usePierreCodeViewDiffOptions() {
  const isDark = useAppDarkMode();

  return useMemo(
    () => ({
      style: pierreCodeViewStyle,
      options: {
        theme: { dark: "pierre-dark" as const, light: "pierre-light" as const },
        themeType: isDark ? ("dark" as const) : ("light" as const),
        overflow: "scroll" as const,
        diffStyle: "unified" as const,
        disableFileHeader: false,
        unsafeCSS: pierreCodeViewUnsafeCSS,
        expandUnchanged: false,
      },
    }),
    [isDark],
  );
}
