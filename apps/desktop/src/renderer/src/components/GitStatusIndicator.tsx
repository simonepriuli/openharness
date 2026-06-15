import { GitCommitIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";

export interface GitStatusIndicatorProps {
  cwd: string | null;
  filePaths?: string[];
}

interface GitStats {
  files: number;
  linesAdded: number;
  linesRemoved: number;
}

export function GitStatusIndicator({ cwd, filePaths }: GitStatusIndicatorProps) {
  const [stats, setStats] = useState<GitStats>({ files: 0, linesAdded: 0, linesRemoved: 0 });
  const [loading, setLoading] = useState(false);
  const filePathsKey = useMemo(() => filePaths?.join("\0") ?? "", [filePaths]);

  useEffect(() => {
    if (!cwd) {
      setStats({ files: 0, linesAdded: 0, linesRemoved: 0 });
      return;
    }

    if (filePaths && filePaths.length === 0) {
      setStats({ files: 0, linesAdded: 0, linesRemoved: 0 });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const result = await window.harness.getGitLineStats({ cwd, filePaths });
        if (cancelled) return;
        setStats(
          result ?? {
            files: 0,
            linesAdded: 0,
            linesRemoved: 0,
          },
        );
      } catch {
        if (!cancelled) {
          setStats({ files: 0, linesAdded: 0, linesRemoved: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cwd, filePaths, filePathsKey]);

  const hasChanges = stats.linesAdded > 0 || stats.linesRemoved > 0;
  const title = hasChanges
    ? `${stats.files} changed file${stats.files === 1 ? "" : "s"} in this thread: +${stats.linesAdded} / -${stats.linesRemoved}`
    : filePaths && filePaths.length === 0
      ? "No file edits in this thread"
      : "No git changes";

  return (
    <div
      className={`app-region-no-drag flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors ${
        hasChanges
          ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/[0.08] dark:bg-[#262626] dark:text-neutral-300"
          : "border-transparent text-slate-400 dark:text-neutral-500"
      } ${loading ? "opacity-70" : "opacity-100"}`}
      title={title}
      aria-label={title}
    >
      <HugeiconsIcon
        icon={GitCommitIcon}
        size={14}
        strokeWidth={1.7}
        aria-hidden
        className={hasChanges ? "text-slate-500 dark:text-neutral-400" : ""}
      />
      <span className="text-emerald-600 dark:text-emerald-400">+{stats.linesAdded}</span>
      <span className="text-rose-500 dark:text-rose-400">-{stats.linesRemoved}</span>
    </div>
  );
}
