import type { CSSProperties } from "react";

const MIRROR_STYLE_PROPERTIES = [
  "direction",
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
] as const;

export function getTextareaCaretCoordinates(
  element: HTMLTextAreaElement,
  position: number,
): { top: number; left: number; height: number } {
  const computed = window.getComputedStyle(element);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";

  for (const property of MIRROR_STYLE_PROPERTIES) {
    mirror.style[property] = computed[property];
  }

  mirror.style.width = `${element.offsetWidth}px`;
  mirror.textContent = element.value.substring(0, position);

  const span = document.createElement("span");
  span.textContent = element.value.substring(position) || ".";
  mirror.appendChild(span);

  document.body.appendChild(mirror);
  const coordinates = {
    top: span.offsetTop,
    left: span.offsetLeft,
    height: span.offsetHeight,
  };
  document.body.removeChild(mirror);

  return coordinates;
}

export function getToolPickerFixedAnchor(
  textarea: HTMLTextAreaElement,
  cursor: number,
): CSSProperties {
  const caret = getTextareaCaretCoordinates(textarea, cursor);
  const rect = textarea.getBoundingClientRect();
  const style = window.getComputedStyle(textarea);
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;

  const top = rect.top + caret.top - textarea.scrollTop + paddingTop;
  const left = rect.left + caret.left + paddingLeft;

  return {
    position: "fixed",
    top,
    left: Math.max(8, left),
    bottom: "auto",
    transform: "translateY(calc(-100% - 6px))",
    width: "min(260px, calc(100vw - 16px))",
  };
}
