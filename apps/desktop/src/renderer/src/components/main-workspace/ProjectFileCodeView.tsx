import { File, Virtualizer } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import { useCallback } from "react";
import { useCodeSelectionToolbar } from "../../hooks/useCodeSelectionToolbar";
import { buildSelectionActionMessage, type SelectionActionId } from "../../lib/selection-action-messages";
import type { OnSelectionAction } from "../../lib/selection-action-types";
import { usePierreFileOptions } from "./pierre-view-options";
import { SelectionActionToolbar } from "./SelectionActionToolbar";

type ProjectFileCodeViewProps = {
  cwd: string;
  relativePath: string;
  file: FileContents;
  onSelectionAction: OnSelectionAction;
};

export function ProjectFileCodeView({
  cwd,
  relativePath,
  file,
  onSelectionAction,
}: ProjectFileCodeViewProps) {
  const { options, style } = usePierreFileOptions();

  const handleAction = useCallback(
    (actionId: SelectionActionId, snapshot: { text: string; lineRange?: { start: number; end: number } }) => {
      const message = buildSelectionActionMessage(
        actionId,
        relativePath,
        snapshot.text,
        snapshot.lineRange,
      );
      onSelectionAction({ cwd, relativePath, message });
    },
    [cwd, onSelectionAction, relativePath],
  );

  const { containerRef, toolbarRef, toolbarState, handleActionClick } = useCodeSelectionToolbar({
    onAction: handleAction,
  });

  return (
    <div className="project-file-code-view">
      <div className="project-file-preview-header" title={file.name}>
        <svg
          className="project-file-preview-header-icon"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path
            d="M4.5 1.75h4.25L12.5 5.5v8.75h-8V1.75Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M8.75 1.75V5.5h3.75"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
        <span className="project-file-preview-header-title">{file.name}</span>
      </div>
      <div ref={containerRef} className="project-file-code-view-body">
        <Virtualizer className="project-explorer-preview-body">
          <File
            file={file}
            options={options}
            className="project-explorer-file-view"
            style={style}
            disableWorkerPool
          />
        </Virtualizer>
      </div>
      {toolbarState ? (
        <SelectionActionToolbar
          toolbarRef={toolbarRef}
          state={toolbarState}
          onAction={handleActionClick}
        />
      ) : null}
    </div>
  );
}
