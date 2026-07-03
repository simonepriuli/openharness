import { useEffect, useMemo, useRef, useState } from "react";
import type { LinearProjectSummary } from "../../../../preload/api";
import { useClampPopoverToViewport } from "../../hooks/useClampPopoverToViewport";

type LinearProjectPickerProps = {
  open: boolean;
  projects: LinearProjectSummary[];
  projectId: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onProjectChange: (projectId: string) => void;
};

export function LinearProjectPicker({
  open,
  projects,
  projectId,
  loading,
  error,
  onClose,
  onProjectChange,
}: LinearProjectPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  useClampPopoverToViewport(panelRef, open);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose, open]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(q));
  }, [projects, query]);

  const selectProject = (id: string) => {
    onProjectChange(id);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="workflow-repo-picker workflow-branch-picker"
      role="dialog"
      aria-label="Select project"
    >
      <div className="workflow-repo-picker-search-wrap">
        <input
          type="search"
          className="workflow-repo-picker-search"
          placeholder="Search projects…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </div>

      <div className="workflow-repo-picker-scroll">
        <section className="workflow-repo-picker-section">
          {loading ? (
            <p className="workflow-repo-picker-empty">Loading projects…</p>
          ) : error ? (
            <p className="workflow-repo-picker-empty workflow-repo-picker-error">{error}</p>
          ) : filteredProjects.length === 0 ? (
            <p className="workflow-repo-picker-empty">No projects found.</p>
          ) : (
            filteredProjects.map((project) => {
              const selected = project.id === projectId;
              return (
                <button
                  key={project.id}
                  type="button"
                  className={`workflow-repo-picker-item${
                    selected ? " workflow-repo-picker-item-selected" : ""
                  }`}
                  onClick={() => selectProject(project.id)}
                >
                  <span>{project.name}</span>
                </button>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
