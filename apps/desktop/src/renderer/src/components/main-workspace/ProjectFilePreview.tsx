import { lazy, Suspense, useMemo } from "react";
import type { FileContents } from "@pierre/diffs";
import type { ReadProjectFileError } from "../../../../preload/api";
import type { OnSelectionAction } from "../../lib/selection-action-types";
import { useProjectFileContents } from "../../hooks/useProjectExplorer";

const ProjectFileCodeView = lazy(() =>
  import("./ProjectFileCodeView").then((module) => ({ default: module.ProjectFileCodeView })),
);

function readErrorMessage(error: ReadProjectFileError): string {
  switch (error) {
    case "binary":
      return "This file looks binary and cannot be previewed.";
    case "too_large":
      return "This file is too large to preview.";
    case "directory":
      return "Select a file to preview its contents.";
    case "outside_project":
      return "This path is outside the project.";
    case "not_found":
    default:
      return "This file could not be found.";
  }
}

type ProjectFilePreviewProps = {
  cwd: string;
  selectedPath: string | null;
  onSelectionAction: OnSelectionAction;
};

export function ProjectFilePreview({ cwd, selectedPath, onSelectionAction }: ProjectFilePreviewProps) {
  const fileQuery = useProjectFileContents(cwd, selectedPath);

  const fileContents = useMemo((): FileContents | null => {
    if (!fileQuery.data?.ok) return null;
    return {
      name: fileQuery.data.relativePath,
      contents: fileQuery.data.contents,
      cacheKey: fileQuery.data.relativePath,
    };
  }, [fileQuery.data]);

  if (!selectedPath) {
    return <div className="project-explorer-placeholder">Select a file to preview.</div>;
  }

  if (fileQuery.isLoading) {
    return <div className="project-explorer-placeholder">Loading file…</div>;
  }

  if (fileQuery.isError) {
    return <div className="project-explorer-placeholder">Could not load this file.</div>;
  }

  if (!fileQuery.data?.ok) {
    return (
      <div className="project-explorer-placeholder">
        {readErrorMessage(fileQuery.data?.error ?? "not_found")}
      </div>
    );
  }

  if (!fileContents) {
    return <div className="project-explorer-placeholder">Could not load this file.</div>;
  }

  return (
    <Suspense fallback={<div className="project-explorer-placeholder">Loading preview…</div>}>
      <ProjectFileCodeView
        cwd={cwd}
        relativePath={selectedPath}
        file={fileContents}
        onSelectionAction={onSelectionAction}
      />
    </Suspense>
  );
}
