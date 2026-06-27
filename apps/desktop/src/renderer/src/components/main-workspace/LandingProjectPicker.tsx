import { ArrowDown01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectSummary } from "../../../../preload/api";
import { listWorkProjectsFromStorage } from "../../lib/chat-storage";
import { getWorkWorkspacePath } from "../../lib/work-workspace";
import type { LandingTarget } from "../../lib/last-used-project";

const EVERYDAY_CHAT_LABEL = "Everyday chat";

type LandingProjectPickerProps = {
  workMode: boolean;
  projects: ProjectSummary[];
  projectsLoading: boolean;
  workProjectsRefreshKey: number;
  selectedTarget: LandingTarget | null;
  onSelectTarget: (target: LandingTarget) => void;
  onOpenFolder: () => void;
  onOpenWorkProject: () => void;
};

function targetsEqual(a: LandingTarget | null, b: LandingTarget | null): boolean {
  if (!a || !b) return false;
  return a.cwd === b.cwd && a.context === b.context;
}

export function LandingProjectPicker({
  workMode,
  projects,
  projectsLoading,
  workProjectsRefreshKey,
  selectedTarget,
  onSelectTarget,
  onOpenFolder,
  onOpenWorkProject,
}: LandingProjectPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [workProjects, setWorkProjects] = useState<ProjectSummary[]>([]);
  const [workProjectsLoading, setWorkProjectsLoading] = useState(workMode);
  const [workWorkspacePath, setWorkWorkspacePath] = useState<string | null>(null);

  useEffect(() => {
    if (!workMode) return;
    let cancelled = false;
    void getWorkWorkspacePath().then((path) => {
      if (!cancelled) setWorkWorkspacePath(path);
    });
    return () => {
      cancelled = true;
    };
  }, [workMode]);

  useEffect(() => {
    if (!workMode) return;
    let cancelled = false;
    setWorkProjectsLoading(true);
    void listWorkProjectsFromStorage()
      .then((items) => {
        if (!cancelled) setWorkProjects(items);
      })
      .finally(() => {
        if (!cancelled) setWorkProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workMode, workProjectsRefreshKey]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const displayLabel = useMemo(() => {
    if (!selectedTarget) return "Select a project";
    if (selectedTarget.context === "work") return EVERYDAY_CHAT_LABEL;
    const list = workMode ? workProjects : projects;
    const match = list.find((project) => project.cwd === selectedTarget.cwd);
    if (match) return match.name;
    const parts = selectedTarget.cwd.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || selectedTarget.cwd;
  }, [projects, selectedTarget, workMode, workProjects]);

  const loading = workMode ? workProjectsLoading || !workWorkspacePath : projectsLoading;

  const selectTarget = (target: LandingTarget) => {
    onSelectTarget(target);
    setOpen(false);
  };

  const everydayTarget: LandingTarget | null =
    workWorkspacePath != null ? { cwd: workWorkspacePath, context: "work" } : null;

  return (
    <div className="chat-landing-picker" ref={panelRef}>
      <button
        type="button"
        className={`workflow-detail-select-trigger chat-landing-picker-trigger${
          selectedTarget
            ? " workflow-detail-select-trigger-selected"
            : " workflow-detail-select-trigger-placeholder"
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="workflow-detail-select-trigger-label">{displayLabel}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={1.8}
          className="workflow-detail-select-trigger-icon"
          aria-hidden
        />
      </button>

      {open ? (
        <div className="chat-landing-picker-panel" role="listbox" aria-label="Select project">
          {loading ? (
            <p className="chat-landing-picker-empty">Loading…</p>
          ) : workMode ? (
            <>
              <section className="chat-landing-picker-section">
                <p className="chat-landing-picker-section-label">Chats</p>
                {everydayTarget ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected={targetsEqual(selectedTarget, everydayTarget)}
                    className={`chat-landing-picker-item${
                      targetsEqual(selectedTarget, everydayTarget)
                        ? " chat-landing-picker-item-selected"
                        : ""
                    }`}
                    onClick={() => selectTarget(everydayTarget)}
                  >
                    {EVERYDAY_CHAT_LABEL}
                  </button>
                ) : null}
              </section>
              <section className="chat-landing-picker-section">
                <p className="chat-landing-picker-section-label">Projects</p>
                {workProjects.length === 0 ? (
                  <p className="chat-landing-picker-empty">No projects yet.</p>
                ) : (
                  workProjects.map((project) => {
                    const target: LandingTarget = {
                      cwd: project.cwd,
                      context: "work-project",
                    };
                    return (
                      <button
                        key={project.cwd}
                        type="button"
                        role="option"
                        aria-selected={targetsEqual(selectedTarget, target)}
                        className={`chat-landing-picker-item${
                          targetsEqual(selectedTarget, target)
                            ? " chat-landing-picker-item-selected"
                            : ""
                        }`}
                        onClick={() => selectTarget(target)}
                      >
                        {project.name}
                      </button>
                    );
                  })
                )}
              </section>
              <button
                type="button"
                className="chat-landing-picker-action"
                onClick={() => {
                  setOpen(false);
                  onOpenWorkProject();
                }}
              >
                <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={1.7} aria-hidden />
                Add project folder…
              </button>
            </>
          ) : (
            <>
              {projects.length === 0 ? (
                <p className="chat-landing-picker-empty">No projects yet.</p>
              ) : (
                projects.map((project) => {
                  const target: LandingTarget = {
                    cwd: project.cwd,
                    context: "coding",
                  };
                  return (
                    <button
                      key={project.cwd}
                      type="button"
                      role="option"
                      aria-selected={targetsEqual(selectedTarget, target)}
                      className={`chat-landing-picker-item${
                        targetsEqual(selectedTarget, target)
                          ? " chat-landing-picker-item-selected"
                          : ""
                      }`}
                      onClick={() => selectTarget(target)}
                    >
                      {project.name}
                    </button>
                  );
                })
              )}
              <button
                type="button"
                className="chat-landing-picker-action"
                onClick={() => {
                  setOpen(false);
                  onOpenFolder();
                }}
              >
                <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={1.7} aria-hidden />
                Open folder…
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
