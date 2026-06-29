import { useEffect, useState, type RefObject } from "react";

export function useTocHeadings(
  containerRef: RefObject<HTMLElement | null>,
  contentKey: string,
): void {
  const [, setHeadings] = useState<{ id: string; text: string; level: 2 | 3 }[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const frame = requestAnimationFrame(() => {
      const elements = container.querySelectorAll("h2, h3");
      const next = Array.from(elements).map((el) => ({
        id: el.id,
        text: el.textContent ?? "",
        level: (el.tagName === "H2" ? 2 : 3) as 2 | 3,
      }));
      setHeadings(next);
      const event = new CustomEvent("docs-toc-update", { detail: next });
      window.dispatchEvent(event);
    });

    return () => cancelAnimationFrame(frame);
  }, [containerRef, contentKey]);
}

export function useTocListener(): { id: string; text: string; level: 2 | 3 }[] {
  const [headings, setHeadings] = useState<{ id: string; text: string; level: 2 | 3 }[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ id: string; text: string; level: 2 | 3 }[]>;
      setHeadings(custom.detail);
    };
    window.addEventListener("docs-toc-update", handler);
    return () => window.removeEventListener("docs-toc-update", handler);
  }, []);

  return headings;
}
