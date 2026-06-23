import {
  Add01Icon,
  ArrowReloadHorizontalIcon,
  Folder01Icon,
  Home09Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GithubRepoSummary } from "../../../../../preload/api";
import { useAzureDevOpsReposQuery } from "../../../queries/use-azure-devops";
import { useGithubReposQuery } from "../../../queries/use-github";

const RECENTS_STORAGE_KEY = "openharness:workflow-repo-recents";
const INTEGRATION_RECENTS_STORAGE_KEY = "openharness:integration-repo-recents";
const MAX_RECENTS = 5;

export type IntegrationRepoSelection = {
  provider: "github" | "azure_devops";
  owner: string;
  repo: string;
  fullName: string;
};

type IntegrationRepoRecent = IntegrationRepoSelection & {
  githubRepoId?: string;
};

type WorkflowRepoPickerProps = {
  open: boolean;
  owner: string;
  repo: string;
  provider?: "github" | "azure_devops";
  includeAzureDevOps?: boolean;
  onClose: () => void;
  onRepoChange: (owner: string, repo: string) => void;
  onIntegrationRepoChange?: (selection: IntegrationRepoSelection | null) => void;
};

function readRecents(storageKey: string): GithubRepoSummary[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GithubRepoSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readIntegrationRecents(): IntegrationRepoRecent[] {
  try {
    const raw = localStorage.getItem(INTEGRATION_RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IntegrationRepoRecent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecents(storageKey: string, repos: GithubRepoSummary[]): void {
  localStorage.setItem(storageKey, JSON.stringify(repos.slice(0, MAX_RECENTS)));
}

function writeIntegrationRecents(repos: IntegrationRepoRecent[]): void {
  localStorage.setItem(INTEGRATION_RECENTS_STORAGE_KEY, JSON.stringify(repos.slice(0, MAX_RECENTS)));
}

function rememberRepo(storageKey: string, repo: GithubRepoSummary): void {
  const next = [
    repo,
    ...readRecents(storageKey).filter((item) => item.fullName !== repo.fullName),
  ].slice(0, MAX_RECENTS);
  writeRecents(storageKey, next);
}

function rememberIntegrationRepo(repo: IntegrationRepoRecent): void {
  const key = `${repo.provider}:${repo.fullName}`;
  const next = [
    repo,
    ...readIntegrationRecents().filter((item) => `${item.provider}:${item.fullName}` !== key),
  ].slice(0, MAX_RECENTS);
  writeIntegrationRecents(next);
}

function matchesQuery(fullName: string, query: string): boolean {
  if (!query) return true;
  return fullName.toLowerCase().includes(query.toLowerCase());
}

function providerLabel(provider: "github" | "azure_devops"): string {
  return provider === "azure_devops" ? "ADO" : "GitHub";
}

export function WorkflowRepoPicker({
  open,
  owner,
  repo,
  provider = "github",
  includeAzureDevOps = false,
  onClose,
  onRepoChange,
  onIntegrationRepoChange,
}: WorkflowRepoPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recents, setRecents] = useState<GithubRepoSummary[]>([]);
  const [integrationRecents, setIntegrationRecents] = useState<IntegrationRepoRecent[]>([]);

  const githubReposQuery = useGithubReposQuery(
    { q: debouncedQuery.trim() || undefined },
    { enabled: open },
  );
  const adoReposQuery = useAzureDevOpsReposQuery(
    { q: debouncedQuery.trim() || undefined },
    { enabled: open && includeAzureDevOps },
  );

  const githubRepos = githubReposQuery.data?.repos ?? [];
  const adoRepos = adoReposQuery.data?.repos ?? [];
  const integrationRepos = useMemo(() => {
    if (!includeAzureDevOps) return [];
    const githubItems = githubRepos.map((item) => ({
      ...item,
      provider: "github" as const,
    }));
    const adoItems = adoRepos.map((item) => ({
      ...item,
      provider: "azure_devops" as const,
    }));
    return [...githubItems, ...adoItems].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [adoRepos, githubRepos, includeAzureDevOps]);

  const loading = includeAzureDevOps
    ? githubReposQuery.isPending ||
      githubReposQuery.isFetching ||
      adoReposQuery.isPending ||
      adoReposQuery.isFetching
    : githubReposQuery.isPending || githubReposQuery.isFetching;

  const error = includeAzureDevOps
    ? githubReposQuery.isError && adoReposQuery.isError
      ? githubReposQuery.error instanceof Error
        ? githubReposQuery.error.message
        : "Failed to load repositories"
      : null
    : githubReposQuery.isError
      ? githubReposQuery.error instanceof Error
        ? githubReposQuery.error.message
        : "Failed to load repositories"
      : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    if (includeAzureDevOps) {
      setIntegrationRecents(readIntegrationRecents());
      return;
    }
    setRecents(readRecents(RECENTS_STORAGE_KEY));
  }, [includeAzureDevOps, open]);

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
    () => recents.filter((item) => matchesQuery(item.fullName, query.trim())),
    [query, recents],
  );
  const filteredIntegrationRecents = useMemo(
    () =>
      integrationRecents.filter((item) => matchesQuery(item.fullName, query.trim())),
    [integrationRecents, query],
  );

  const selectRepo = (item: GithubRepoSummary) => {
    rememberRepo(RECENTS_STORAGE_KEY, item);
    setRecents(readRecents(RECENTS_STORAGE_KEY));
    onRepoChange(item.owner, item.name);
    onClose();
  };

  const selectIntegrationRepo = (item: IntegrationRepoRecent) => {
    rememberIntegrationRepo(item);
    setIntegrationRecents(readIntegrationRecents());
    onIntegrationRepoChange?.({
      provider: item.provider,
      owner: item.owner,
      repo: item.repo,
      fullName: item.fullName,
    });
    onClose();
  };

  const clearRepo = () => {
    if (includeAzureDevOps) {
      onIntegrationRepoChange?.(null);
    } else {
      onRepoChange("", "");
    }
    onClose();
  };

  const refreshRepos = () => {
    void githubReposQuery.refetch();
    if (includeAzureDevOps) {
      void adoReposQuery.refetch();
    }
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
          {includeAzureDevOps
            ? filteredIntegrationRecents.map((item) => {
                const selected =
                  item.provider === provider && item.owner === owner && item.repo === repo;
                return (
                  <button
                    key={`recent-${item.provider}-${item.fullName}`}
                    type="button"
                    className={`workflow-repo-picker-item${
                      selected ? " workflow-repo-picker-item-selected" : ""
                    }`}
                    onClick={() => selectIntegrationRepo(item)}
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={16}
                      className="workflow-repo-picker-item-icon"
                    />
                    <span>
                      [{providerLabel(item.provider)}] {item.fullName}
                    </span>
                  </button>
                );
              })
            : filteredRecents.map((item) => {
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
          ) : includeAzureDevOps ? (
            integrationRepos.length === 0 ? (
              <p className="workflow-repo-picker-empty">No repositories found.</p>
            ) : (
              integrationRepos.map((item) => {
                const selected =
                  item.provider === provider && item.owner === owner && item.name === repo;
                return (
                  <button
                    key={`${item.provider}-${item.githubRepoId}`}
                    type="button"
                    className={`workflow-repo-picker-item${
                      selected ? " workflow-repo-picker-item-selected" : ""
                    }`}
                    onClick={() =>
                      selectIntegrationRepo({
                        provider: item.provider,
                        owner: item.owner,
                        repo: item.name,
                        fullName: item.fullName,
                        githubRepoId: item.githubRepoId,
                      })
                    }
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={16}
                      className="workflow-repo-picker-item-icon"
                    />
                    <span>
                      [{providerLabel(item.provider)}] {item.fullName}
                    </span>
                  </button>
                );
              })
            )
          ) : githubRepos.length === 0 ? (
            <p className="workflow-repo-picker-empty">No repositories found.</p>
          ) : (
            githubRepos.map((item) => {
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
          onClick={() => void refreshRepos()}
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
