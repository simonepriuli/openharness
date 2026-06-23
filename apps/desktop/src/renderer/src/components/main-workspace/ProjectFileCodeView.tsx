import { File, Virtualizer } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import { useCallback, useMemo, type CSSProperties } from "react";
import { useAppDarkMode } from "../../hooks/useAppDarkMode";
import { useCodeSelectionToolbar } from "../../hooks/useCodeSelectionToolbar";
import { buildSelectionActionMessage, type SelectionActionId } from "../../lib/selection-action-messages";
import type { OnSelectionAction } from "../../lib/selection-action-types";
import { SelectionActionToolbar } from "./SelectionActionToolbar";

const previewUnsafeCSS = `
  :host {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    --diffs-light-bg: var(--bg);
    --diffs-dark-bg: var(--bg);
    background-color: var(--bg);
    user-select: text;
    -webkit-user-select: text;
  }

  pre,
  code {
    background-color: var(--bg);
    user-select: text;
    -webkit-user-select: text;
  }

  [data-content],
  [data-gutter],
  [data-line] {
    user-select: text;
    -webkit-user-select: text;
  }

  [data-file] {
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  [data-file] [data-code] {
    flex: 1 0 auto;
    align-self: stretch;
    align-content: start;
    grid-auto-rows: max-content;
    min-height: 0;
    padding-top: 0;
  }

  [data-file] [data-gutter],
  [data-file] [data-content] {
    background-color: var(--bg);
  }

  [data-file] [data-gutter] {
    padding-left: var(--project-explorer-content-inset, 18px);
  }

  [data-file] [data-column-number] {
    padding-left: 0;
  }
`;

const previewThemeStyle = {
  display: "flex",
  flexDirection: "column",
  flex: "1 0 auto",
  minHeight: 0,
  width: "100%",
  background: "var(--bg)",
  color: "var(--text)",
  "--project-explorer-content-inset": "18px",
  "--diffs-light-bg": "var(--bg)",
  "--diffs-dark-bg": "var(--bg)",
} as CSSProperties;

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
  const isDark = useAppDarkMode();
  const previewOptions = useMemo(
    () => ({
      theme: { dark: "pierre-dark" as const, light: "pierre-light" as const },
      themeType: isDark ? ("dark" as const) : ("light" as const),
      overflow: "scroll" as const,
      disableFileHeader: true,
      unsafeCSS: previewUnsafeCSS,
    }),
    [isDark],
  );

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
            options={previewOptions}
            className="project-explorer-file-view"
            style={previewThemeStyle}
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
