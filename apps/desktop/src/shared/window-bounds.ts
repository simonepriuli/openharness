/** Matches expanded sidenav width (`w-[280px]`). */
const SIDEBAR_WIDTH = 280;

/** Matches renderer `RIGHT_PANEL_RESIZER_WIDTH`. */
const RIGHT_PANEL_RESIZER_WIDTH = 6;

/** Matches renderer `DEFAULT_RIGHT_PANEL_WIDTH`. */
const DEFAULT_RIGHT_PANEL_WIDTH = 560;

/** Room for the composer toolbar (progress, spend, mode chips, model switcher, send). */
const MIN_COMPOSER_COLUMN_WIDTH = 560;

/**
 * BrowserWindow minimum size with sidebar and right panel open:
 * sidenav + composer column + resizer + right panel.
 */
export const MIN_WINDOW_WIDTH =
  SIDEBAR_WIDTH +
  MIN_COMPOSER_COLUMN_WIDTH +
  RIGHT_PANEL_RESIZER_WIDTH +
  DEFAULT_RIGHT_PANEL_WIDTH;

/** Titlebar (38) + chat viewport (542) + composer overlay (140). */
export const MIN_WINDOW_HEIGHT = 720;
