import PierreHighlightWorker from "@pierre/diffs/worker/worker.js?worker";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { useMemo, type ReactNode } from "react";

/**
 * Spins up a pool of Web Workers so Shiki syntax highlighting runs off the main
 * thread. Without this, rendering many/large diffs blocks the JS thread and
 * makes the panel (and sidebar resizing) janky. The main thread renders plain
 * text synchronously and the workers stream highlighting back in.
 *
 * Theme is controlled by the pool (component-level `theme` is ignored once a
 * pool is active), so we pass the dual Pierre theme here. Light/dark selection
 * is still handled per-component via `themeType` + CSS variables.
 */
export function PierreWorkerPoolProvider({ children }: { children: ReactNode }) {
  const poolOptions = useMemo(
    () => ({
      workerFactory: () => new PierreHighlightWorker(),
      poolSize: Math.min(4, Math.max(2, Math.floor((navigator.hardwareConcurrency ?? 4) / 2))),
    }),
    [],
  );

  const highlighterOptions = useMemo(
    () => ({
      theme: { dark: "pierre-dark" as const, light: "pierre-light" as const },
    }),
    [],
  );

  return (
    <WorkerPoolContextProvider poolOptions={poolOptions} highlighterOptions={highlighterOptions}>
      {children}
    </WorkerPoolContextProvider>
  );
}
