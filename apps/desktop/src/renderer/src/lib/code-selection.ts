import type { SelectionLineRange } from "./selection-action-messages";

const MIN_SELECTION_NON_WHITESPACE = 3;

export type CodeSelectionSnapshot = {
  text: string;
  rangeRect: DOMRect;
  containerRect: DOMRect;
  lineRange?: SelectionLineRange;
};

export type ToolbarPosition = {
  top: number;
  left: number;
};

function getShadowHost(node: Node): Node | null {
  const root = node.getRootNode();
  if (root instanceof ShadowRoot) {
    return root.host;
  }
  return null;
}

function isNodeWithinContainer(node: Node | null, container: HTMLElement): boolean {
  if (!node) return false;

  let current: Node | null = node;
  while (current) {
    if (current === container) return true;
    const shadowHost = getShadowHost(current);
    if (shadowHost instanceof HTMLElement && container.contains(shadowHost)) {
      return true;
    }
    current = shadowHost ?? current.parentNode;
  }

  return false;
}

function parseLineNumber(node: Node | null): number | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement) {
      const lineAttr = current.getAttribute("data-line");
      if (lineAttr) {
        const parsed = Number.parseInt(lineAttr, 10);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    current = getShadowHost(current) ?? current.parentNode;
  }
  return null;
}

function deriveLineRange(
  anchorNode: Node | null,
  focusNode: Node | null,
): SelectionLineRange | undefined {
  const startLine = parseLineNumber(anchorNode);
  const endLine = parseLineNumber(focusNode);
  if (startLine == null || endLine == null) return undefined;
  return {
    start: Math.min(startLine, endLine),
    end: Math.max(startLine, endLine),
  };
}

function countNonWhitespace(text: string): number {
  let count = 0;
  for (const char of text) {
    if (!/\s/.test(char)) count += 1;
  }
  return count;
}

type ShadowRootWithSelection = ShadowRoot & {
  getSelection?: () => Selection | null;
};

/**
 * Pierre renders code inside an open shadow root on a <diffs-container> custom
 * element. In Chromium, selections inside a shadow tree are NOT exposed through
 * window.getSelection(); they must be read via shadowRoot.getSelection().
 */
function findShadowRootWithSelection(container: HTMLElement): ShadowRootWithSelection | null {
  const tagged = container.querySelector("diffs-container");
  if (tagged?.shadowRoot) return tagged.shadowRoot as ShadowRootWithSelection;

  for (const element of container.querySelectorAll<HTMLElement>("*")) {
    if (element.shadowRoot) return element.shadowRoot as ShadowRootWithSelection;
  }
  return null;
}

function getActiveSelection(container: HTMLElement): Selection | null {
  const shadowRoot = findShadowRootWithSelection(container);
  if (shadowRoot && typeof shadowRoot.getSelection === "function") {
    const shadowSelection = shadowRoot.getSelection();
    if (shadowSelection && !shadowSelection.isCollapsed && shadowSelection.rangeCount > 0) {
      return shadowSelection;
    }
  }

  const windowSelection = window.getSelection();
  if (windowSelection && !windowSelection.isCollapsed && windowSelection.rangeCount > 0) {
    return windowSelection;
  }

  return null;
}

export function readCodeSelection(container: HTMLElement): CodeSelectionSnapshot | null {
  const selection = getActiveSelection(container);
  if (!selection) return null;

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!isNodeWithinContainer(anchorNode, container) || !isNodeWithinContainer(focusNode, container)) {
    return null;
  }

  const text = selection.toString().trim();
  if (countNonWhitespace(text) < MIN_SELECTION_NON_WHITESPACE) return null;

  const containerRect = container.getBoundingClientRect();
  const lineRange = deriveLineRange(anchorNode, focusNode);

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(false);
  const endRect = range.getBoundingClientRect();
  if (endRect.width === 0 && endRect.height === 0) {
    const fullRect = selection.getRangeAt(0).getBoundingClientRect();
    if (fullRect.width === 0 && fullRect.height === 0) return null;
    return { text, rangeRect: fullRect, containerRect, lineRange };
  }

  return { text, rangeRect: endRect, containerRect, lineRange };
}

export function positionToolbarAboveEnd(
  rect: DOMRect,
  toolbarSize: { width: number; height: number },
  bounds?: DOMRect,
  gap = 8,
): ToolbarPosition {
  const margin = 8;
  const minLeft = bounds ? Math.max(margin, bounds.left) : margin;
  const maxRight = bounds
    ? Math.min(window.innerWidth - margin, bounds.right)
    : window.innerWidth - margin;

  let left = rect.right - toolbarSize.width;
  let top = rect.top - toolbarSize.height - gap;

  if (left + toolbarSize.width > maxRight) {
    left = maxRight - toolbarSize.width;
  }
  if (left < minLeft) left = minLeft;

  if (top < margin) {
    top = rect.bottom + gap;
  }
  if (top + toolbarSize.height > window.innerHeight - margin) {
    top = window.innerHeight - toolbarSize.height - margin;
  }

  return { top, left };
}
