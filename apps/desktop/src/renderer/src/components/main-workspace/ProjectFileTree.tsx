import { preparePresortedFileTreeInput } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ProjectGitStatusEntry } from "../../../../preload/api";
import { useProjectFilePaths, useProjectGitStatus } from "../../hooks/useProjectExplorer";

const treeThemeStyle = {
  backgroundColor: "var(--settings-page-bg)",
  color: "var(--text)",
  "--trees-bg-override": "var(--settings-page-bg)",
  "--trees-theme-sidebar-bg": "var(--settings-page-bg)",
  "--trees-fg-override": "var(--text)",
  "--trees-theme-sidebar-fg": "var(--text)",
  "--trees-fg-muted-override": "var(--text-soft)",
  "--trees-theme-input-bg": "var(--settings-control-bg)",
  "--trees-theme-input-fg": "var(--text)",
  "--trees-input-bg-override": "var(--settings-control-bg)",
  "--trees-search-bg-override": "var(--settings-control-bg)",
  "--trees-search-fg-override": "var(--text)",
  "--trees-border-color-override": "var(--settings-control-border)",
  "--trees-focus-ring-color-override": "var(--accent)",
  "--trees-theme-list-active-selection-bg": "color-mix(in oklab, var(--accent) 24%, transparent)",
  "--trees-theme-list-hover-bg": "color-mix(in oklab, var(--accent) 12%, transparent)",
  "--trees-theme-focus-ring": "var(--accent)",
  height: "100%",
  minHeight: 0,
} as CSSProperties;

const treeUnsafeCSS = `
  [data-file-tree-search-input] {
    color: var(--text);
    background-color: var(--settings-control-bg);
    border-color: var(--settings-control-border);
  }

  [data-file-tree-search-input]::placeholder {
    color: var(--text-soft);
  }

  [data-file-tree-search-input]:focus-visible,
  [data-file-tree-search-input][data-file-tree-search-input-fake-focus='true'] {
    outline-color: var(--accent);
  }

  /*
   * The search input lives outside the scroll area with a symmetric
   * --trees-padding-inline gutter, while rows live inside the scroll
   * container. Give the scroll container the same symmetric padding and
   * zero out the per-row margins so row backgrounds line up exactly with
   * the search input on both edges. macOS overlay scrollbars float over
   * this padding instead of consuming layout width, so no gutter offset
   * is needed.
   */
  [data-file-tree-virtualized-scroll='true'] {
    padding-inline: var(--trees-padding-inline);
    scrollbar-gutter: auto;
    scrollbar-width: auto;
    scrollbar-color: auto;
  }

  [data-type='item'] {
    margin-inline: 0;
    width: auto;
    box-sizing: border-box;
  }

  [data-file-tree-sticky-overlay-content='true'] [data-type='item'] {
    left: 0 !important;
    right: 0 !important;
    width: auto !important;
  }

  [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar {
    width: initial;
    height: initial;
  }

  [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-thumb {
    min-height: initial;
    border: initial;
    border-radius: initial;
    background-clip: initial;
    background-color: initial;
  }

  [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-track {
    background: initial;
  }

  [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar-corner {
    background: initial;
  }
`;

type ProjectFileTreeProps = {
  cwd: string;
  gitStatsRefreshKey: number;
  selectedPath: string | null;
  onSelectFile: (relativePath: string) => void;
};

function ProjectFileTreeInner({
  cwd,
  paths,
  gitStatus,
  selectedPath,
  onSelectFile,
}: {
  cwd: string;
  paths: readonly string[];
  gitStatus: readonly ProjectGitStatusEntry[];
  selectedPath: string | null;
  onSelectFile: (relativePath: string) => void;
}) {
  const [treeReady, setTreeReady] = useState(false);
  const filePathSet = useMemo(() => new Set(paths), [paths]);
  const filePathSetRef = useRef(filePathSet);
  filePathSetRef.current = filePathSet;
  const preparedInput = useMemo(() => preparePresortedFileTreeInput(paths), [paths]);
  const onSelectFileRef = useRef(onSelectFile);
  onSelectFileRef.current = onSelectFile;

  const { model } = useFileTree({
    preparedInput,
    search: true,
    fileTreeSearchMode: "hide-non-matches",
    gitStatus,
    icons: "standard",
    flattenEmptyDirectories: true,
    unsafeCSS: treeUnsafeCSS,
    onSelectionChange: (selectedPaths) => {
      const nextFile = [...selectedPaths]
        .reverse()
        .find((path) => filePathSetRef.current.has(path));
      if (nextFile) {
        onSelectFileRef.current(nextFile);
      }
    },
  });

  const gitStatusKey = useMemo(
    () => gitStatus.map((entry) => `${entry.path}:${entry.status}`).join("\0"),
    [gitStatus],
  );

  useEffect(() => {
    setTreeReady(true);
  }, []);

  useEffect(() => {
    if (!treeReady) return;
    model.setGitStatus(gitStatus);
  }, [model, gitStatus, gitStatusKey, treeReady]);

  useEffect(() => {
    if (!treeReady || !selectedPath || !filePathSet.has(selectedPath)) return;
    model.focusPath(selectedPath);
  }, [model, selectedPath, filePathSet, treeReady]);

  if (!treeReady) {
    return <div className="project-explorer-placeholder">Loading tree…</div>;
  }

  return (
    <FileTree
      model={model}
      className="project-explorer-tree-view"
      style={treeThemeStyle}
      aria-label={`Project files for ${cwd}`}
    />
  );
}

export function ProjectFileTree({
  cwd,
  gitStatsRefreshKey,
  selectedPath,
  onSelectFile,
}: ProjectFileTreeProps) {
  const pathsQuery = useProjectFilePaths(true, cwd);
  const gitStatusQuery = useProjectGitStatus(true, cwd, gitStatsRefreshKey);

  if (pathsQuery.isLoading) {
    return <div className="project-explorer-placeholder">Loading files…</div>;
  }

  if (pathsQuery.isError) {
    return <div className="project-explorer-placeholder">Could not load project files.</div>;
  }

  const paths = pathsQuery.data ?? [];
  const gitStatus = gitStatusQuery.data ?? [];

  if (paths.length === 0) {
    return <div className="project-explorer-placeholder">No files found in this project.</div>;
  }

  return (
    <ProjectFileTreeInner
      key={cwd}
      cwd={cwd}
      paths={paths}
      gitStatus={gitStatus}
      selectedPath={selectedPath}
      onSelectFile={onSelectFile}
    />
  );
}
