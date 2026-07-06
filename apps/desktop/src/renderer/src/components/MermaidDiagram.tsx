import { memo, useEffect, useId, useRef, useState } from "react";
import { readResolvedDarkMode, useResolvedDarkMode } from "../lib/use-resolved-dark-mode";
import { CodeBlock } from "./CodeBlock";

type MermaidModule = typeof import("mermaid");

const MERMAID_RENDER_DEBOUNCE_MS = 300;
const renderedSvgCache = new Map<string, string>();

let mermaidModulePromise: Promise<MermaidModule["default"]> | null = null;
let mermaidInitializedTheme: "dark" | "default" | null = null;

function mermaidCacheKey(chart: string, isDark: boolean): string {
  return `${isDark ? "dark" : "light"}\0${chart.trim()}`;
}

function loadMermaid(): Promise<MermaidModule["default"]> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((module) => module.default);
  }
  return mermaidModulePromise;
}

function isMermaidErrorSvg(svg: string): boolean {
  return svg.includes("Syntax error in text");
}

async function ensureMermaidInitialized(isDark: boolean): Promise<MermaidModule["default"]> {
  const mermaid = await loadMermaid();
  const theme = isDark ? "dark" : "default";

  if (mermaidInitializedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme,
    });
    mermaidInitializedTheme = theme;
  }

  return mermaid;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}

interface MermaidDiagramProps {
  chart: string;
}

function MermaidDiagramInner({ chart }: MermaidDiagramProps) {
  const isDark = useResolvedDarkMode();
  const debouncedChart = useDebouncedValue(chart, MERMAID_RENDER_DEBOUNCE_MS);
  const renderId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState(
    () => renderedSvgCache.get(mermaidCacheKey(chart, readResolvedDarkMode())) ?? "",
  );
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      const trimmedChart = debouncedChart.trim();
      if (!trimmedChart) {
        if (!cancelled) {
          setSvg("");
          setRenderFailed(true);
        }
        return;
      }

      const cacheKey = mermaidCacheKey(trimmedChart, isDark);
      const cachedSvg = renderedSvgCache.get(cacheKey);
      if (cachedSvg) {
        if (!cancelled) {
          setSvg(cachedSvg);
          setRenderFailed(false);
        }
        return;
      }

      try {
        const mermaid = await ensureMermaidInitialized(isDark);
        const uniqueId = `mermaid-${renderId}-${Date.now()}`;
        const { svg: renderedSvg, bindFunctions } = await mermaid.render(uniqueId, trimmedChart);

        if (cancelled) return;

        if (isMermaidErrorSvg(renderedSvg)) {
          setSvg("");
          setRenderFailed(true);
          return;
        }

        renderedSvgCache.set(cacheKey, renderedSvg);
        setSvg(renderedSvg);
        setRenderFailed(false);

        if (bindFunctions && containerRef.current) {
          window.setTimeout(() => {
            if (!cancelled && containerRef.current) {
              bindFunctions(containerRef.current);
            }
          }, 0);
        }
      } catch {
        if (!cancelled) {
          setSvg("");
          setRenderFailed(true);
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [debouncedChart, isDark, renderId]);

  if (renderFailed) {
    return (
      <CodeBlock>
        <code className="language-mermaid">{chart}</code>
      </CodeBlock>
    );
  }

  if (!svg) {
    return <div className="mermaid-block mermaid-block-loading" aria-hidden />;
  }

  return (
    <div className="mermaid-block">
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

export const MermaidDiagram = memo(MermaidDiagramInner);
