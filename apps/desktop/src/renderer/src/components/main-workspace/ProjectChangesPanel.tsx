import { lazy, Suspense } from "react";
import { useProjectUnstagedChanges } from "../../hooks/useProjectExplorer";

const ProjectChangesDiffView = lazy(() =>
  import("./ProjectChangesDiffView").then((module) => ({
    default: module.ProjectChangesDiffView,
  })),
);

type ProjectChangesPanelProps = {
  cwd: string | null;
  gitStatsRefreshKey: number;
  enabled: boolean;
};

export function ProjectChangesPanel({
  cwd,
  gitStatsRefreshKey,
  enabled,
}: ProjectChangesPanelProps) {
  const changesQuery = useProjectUnstagedChanges(enabled, cwd, gitStatsRefreshKey);

  if (!cwd) {
    return <div className="project-explorer-placeholder">Open a project to view changes.</div>;
  }

  if (changesQuery.isPending) {
    return <div className="project-explorer-placeholder">Loading changes…</div>;
  }

  if (changesQuery.isError) {
    return <div className="project-explorer-placeholder">Could not load changes.</div>;
  }

  const changes = changesQuery.data;
  if (!changes || changes.files.length === 0) {
    return <div className="project-explorer-placeholder">No unstaged changes.</div>;
  }

  if (!changes.patch.trim()) {
    return <div className="project-explorer-placeholder">No unstaged changes.</div>;
  }

  return (
    <div className="project-changes-panel">
      <Suspense fallback={<div className="project-explorer-placeholder">Loading diff…</div>}>
        <ProjectChangesDiffView key={cwd} cwd={cwd} patch={changes.patch} />
      </Suspense>
    </div>
  );
}
