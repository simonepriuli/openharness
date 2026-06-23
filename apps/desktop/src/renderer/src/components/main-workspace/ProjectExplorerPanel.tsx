import { useEffect, useState } from "react";
import {
  DEFAULT_EXPLORER_TREE_WIDTH,
  MIN_EXPLORER_PREVIEW_WIDTH,
  MIN_EXPLORER_TREE_WIDTH,
  useProjectExplorerResize,
} from "../../hooks/useProjectExplorerResize";
import { ProjectFilePreview } from "./ProjectFilePreview";
import { ProjectFileTree } from "./ProjectFileTree";

type ProjectExplorerPanelProps = {
  cwd: string | null;
  gitStatsRefreshKey: number;
};

export function ProjectExplorerPanel({ cwd, gitStatsRefreshKey }: ProjectExplorerPanelProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [treeWidth, setTreeWidth] = useState(DEFAULT_EXPLORER_TREE_WIDTH);
  const { containerRef, onResizePointerDown, clampWidth } = useProjectExplorerResize({
    treeWidth,
    onTreeWidthChange: setTreeWidth,
  });

  useEffect(() => {
    setSelectedPath(null);
  }, [cwd]);

  useEffect(() => {
    const reclampTreeWidth = () => {
      setTreeWidth((current) => clampWidth(current));
    };

    reclampTreeWidth();
    window.addEventListener("resize", reclampTreeWidth);
    return () => window.removeEventListener("resize", reclampTreeWidth);
  }, [clampWidth]);

  if (!cwd) {
    return <div className="project-explorer-placeholder">Open a project to browse files.</div>;
  }

  return (
    <div ref={containerRef} className="project-explorer">
      <div
        className="project-explorer-tree"
        style={{
          width: treeWidth,
          maxWidth: treeWidth,
          minWidth: MIN_EXPLORER_TREE_WIDTH,
          flex: `0 0 ${treeWidth}px`,
        }}
      >
        <ProjectFileTree
          cwd={cwd}
          gitStatsRefreshKey={gitStatsRefreshKey}
          selectedPath={selectedPath}
          onSelectFile={setSelectedPath}
        />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize file tree"
        className="project-explorer-resizer"
        onPointerDown={onResizePointerDown}
      />
      <div
        className="project-explorer-preview"
        style={{ minWidth: MIN_EXPLORER_PREVIEW_WIDTH }}
      >
        <ProjectFilePreview cwd={cwd} selectedPath={selectedPath} />
      </div>
    </div>
  );
}
