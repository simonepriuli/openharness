import {
  Add01Icon,
  ArrowReloadHorizontalIcon,
  Folder01Icon,
  Home09Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GithubRepoSummary } from "../../../../../preload/api";
import { useGithubReposQuery } from "../../../queries/use-github";

const RECENTS_STORAGE_KEY = "openharness:workflow-repo-recents";
const MAX_RECENTS = 5;

type WorkflowRepoPickerProps = {
  open: boolean;
  owner: string;
  repo: string;
  onClose: () => void;
  onRepoChange: (owner: string, repo: string) => void;
};

function readRecents(): GithubRepoSummary[] {
  try {
    const raw = localStorage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GithubRepoSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecents(repos: GithubRepoSummary[]): void {
  localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(repos.slice(0, MAX_RECENTS)));
}

function rememberRepo(repo: GithubRepoSummary): void {
  const next = [
    repo,
    ...readRecents().filter((item) => item.fullName !== repo.fullName),
  ].slice(0, MAX_RECENTS);
  writeRecents(next);
}

function matchesQuery(repo: GithubRepoSummary, query: string): boolean {
  if (!query) return true;
  return repo.fullName.toLowerCase().includes(query.toLowerCase());
}

export function WorkflowRepoPicker({
  open,
  owner,
  repo,
  onClose,
  onRepoChange,
}: WorkflowRepoPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recents, setRecents] = useState<GithubRepoSummary[]>([]);

  const reposQuery = useGithubReposQuery(
    { q: debouncedQuery.trim() || undefined },
    { enabled: open },
  );

  const repos = reposQuery.data?.repos ?? [];
  const loading = reposQuery.isPending || reposQuery.isFetching;
  const error = reposQuery.isError
    ? reposQuery.error instanceof Error
      ? reposQuery.error.message
      : "Failed to load repositories"
    : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setRecents(readRecents());
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
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

  const filteredRecents = useMemo(
    () => recents.filter((item) => matchesQuery(item, query.trim())),
    [query, recents],
  );

  const selectRepo = (item: GithubRepoSummary) => {
    rememberRepo(item);
    setRecents(readRecents());
    onRepoChange(item.owner, item.name);
    onClose();
  };

  const clearRepo = () => {
    onRepoChange("", "");
    onClose();
  };

  if (!open) return null;

  const hasSelection = Boolean(owner && repo);

  return (
    <div
      ref={panelRef}
      className="workflow-repo-picker"
      role="dialog"
      aria-label="Select repository"
    >
      <div className="workflow-repo-picker-search-wrap">
        <input
          type="search"
          className="workflow-repo-picker-search"
          placeholder="Search repositories…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </div>

      <div className="workflow-repo-picker-scroll">
        <section className="workflow-repo-picker-section">
          <p className="workflow-repo-picker-section-label">Recents</p>
          <button
            type="button"
            className={`workflow-repo-picker-item${
              !hasSelection ? " workflow-repo-picker-item-selected" : ""
            }`}
            onClick={clearRepo}
          >
            <HugeiconsIcon icon={Home09Icon} size={16} className="workflow-repo-picker-item-icon" />
            <span>No Repository</span>
          </button>
          {filteredRecents.map((item) => {
            const selected = item.owner === owner && item.name === repo;
            return (
              <button
                key={`recent-${item.fullName}`}
                type="button"
                className={`workflow-repo-picker-item${
                  selected ? " workflow-repo-picker-item-selected" : ""
                }`}
                onClick={() => selectRepo(item)}
              >
                <HugeiconsIcon
                  icon={Folder01Icon}
                  size={16}
                  className="workflow-repo-picker-item-icon"
                />
                <span>{item.fullName}</span>
              </button>
            );
          })}
        </section>

        <section className="workflow-repo-picker-section">
          <div className="workflow-repo-picker-section-header">
            <p className="workflow-repo-picker-section-label">All Repositories</p>
          </div>

          {loading ? (
            <p className="workflow-repo-picker-empty">Loading repositories…</p>
          ) : error ? (
            <p className="workflow-repo-picker-empty workflow-repo-picker-error">{error}</p>
          ) : repos.length === 0 ? (
            <p className="workflow-repo-picker-empty">No repositories found.</p>
          ) : (
            repos.map((item) => {
              const selected = item.owner === owner && item.name === repo;
              return (
                <button
                  key={item.githubRepoId}
                  type="button"
                  className={`workflow-repo-picker-item${
                    selected ? " workflow-repo-picker-item-selected" : ""
                  }`}
                  onClick={() => selectRepo(item)}
                >
                  <HugeiconsIcon
                    icon={Folder01Icon}
                    size={16}
                    className="workflow-repo-picker-item-icon"
                  />
                  <span>{item.fullName}</span>
                </button>
              );
            })
          )}
        </section>
      </div>

      <div className="workflow-repo-picker-footer">
        <button
          type="button"
          className="workflow-repo-picker-footer-action"
          onClick={() => void window.harness.openGithubInstall()}
        >
          <HugeiconsIcon icon={Add01Icon} size={15} className="workflow-repo-picker-footer-icon" />
          Add Repositories
        </button>
        <button
          type="button"
          className="workflow-repo-picker-footer-action"
          onClick={() => void reposQuery.refetch()}
          disabled={loading}
        >
          <HugeiconsIcon
            icon={ArrowReloadHorizontalIcon}
            size={15}
            className="workflow-repo-picker-footer-icon"
          />
          Refresh
        </button>
      </div>
    </div>
  );
}
