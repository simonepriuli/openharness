import type { ReactNode } from "react";
import type { ProjectSummary } from "../../../../preload/api";
import type { LandingTarget } from "../../lib/last-used-project";
import { Kbd, KbdGroup } from "../ui/kbd";
import { LandingProjectPicker } from "./LandingProjectPicker";

type ChatLandingProps = {
  workMode: boolean;
  projects: ProjectSummary[];
  projectsLoading: boolean;
  workProjectsRefreshKey: number;
  selectedTarget: LandingTarget | null;
  onSelectTarget: (target: LandingTarget) => void;
  onOpenFolder: () => void;
  onOpenWorkProject: () => void;
  hidePlanHint: boolean;
  composer: ReactNode;
};

export function ChatLanding({
  workMode,
  projects,
  projectsLoading,
  workProjectsRefreshKey,
  selectedTarget,
  onSelectTarget,
  onOpenFolder,
  onOpenWorkProject,
  hidePlanHint,
  composer,
}: ChatLandingProps) {
  return (
    <div className="chat-landing-stack">
      <div className="chat-landing-picker-row">
        <LandingProjectPicker
          workMode={workMode}
          projects={projects}
          projectsLoading={projectsLoading}
          workProjectsRefreshKey={workProjectsRefreshKey}
          selectedTarget={selectedTarget}
          onSelectTarget={onSelectTarget}
          onOpenFolder={onOpenFolder}
          onOpenWorkProject={onOpenWorkProject}
        />
      </div>
      <div className="chat-landing-composer">{composer}</div>
      {!hidePlanHint ? (
        <p className="chat-landing-plan-hint">
          Composer modes
          <KbdGroup>
            <Kbd aria-label="Shift">⇧</Kbd>
            <span className="chat-landing-plan-kbd-separator" aria-hidden>
              +
            </span>
            <Kbd>Tab</Kbd>
          </KbdGroup>
          <span className="chat-landing-plan-hint-modes">Plan · Swarm · Debug</span>
        </p>
      ) : null}
    </div>
  );
}
