import { parsePatchFiles, type CodeViewDiffItem } from "@pierre/diffs";
import { CodeView } from "@pierre/diffs/react";
import { memo, useMemo } from "react";
import { PierreWorkerPoolProvider } from "./PierreWorkerPoolProvider";
import { usePierreCodeViewDiffOptions } from "./pierre-view-options";

type ProjectChangesDiffViewProps = {
  cwd: string;
  patch: string;
};

function ProjectChangesDiffViewInner({ cwd, patch }: ProjectChangesDiffViewProps) {
  const { options, style } = usePierreCodeViewDiffOptions();

  const items = useMemo((): CodeViewDiffItem[] => {
    try {
      return parsePatchFiles(patch, cwd).flatMap((parsed, patchIndex) =>
        parsed.files.map((fileDiff, fileIndex) => ({
          id: fileDiff.cacheKey ?? `${fileDiff.name}:${patchIndex}:${fileIndex}`,
          type: "diff" as const,
          fileDiff,
        })),
      );
    } catch (error) {
      console.error("[ProjectChangesDiffView] Failed to parse patch", error);
      return [];
    }
  }, [patch]);

  if (items.length === 0) {
    return <div className="project-explorer-placeholder">Could not render changes.</div>;
  }

  return (
    <PierreWorkerPoolProvider>
      <CodeView
        items={items}
        options={options}
        className="project-changes-scroll"
        style={style}
      />
    </PierreWorkerPoolProvider>
  );
}

export const ProjectChangesDiffView = memo(ProjectChangesDiffViewInner);
