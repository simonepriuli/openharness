import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GitRemoteInfo, GithubRepoSummary } from "../../../../preload/api";

type GithubConnectDialogProps = {
  open: boolean;
  projectPath: string;
  agentReady: boolean;
  onClose: () => void;
  onOpenGithubSettings: () => void;
  onConnect: (options: {
    owner: string;
    repo: string;
    remoteUrl?: string | null;
  }) => Promise<{ warning?: string | null } | void>;
};

export function GithubConnectDialog({
  open,
  projectPath,
  agentReady,
  onClose,
  onOpenGithubSettings,
  onConnect,
}: GithubConnectDialogProps) {
  const [remoteInfo, setRemoteInfo] = useState<GitRemoteInfo | null>(null);
  const [repos, setRepos] = useState<GithubRepoSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ owner: string; repo: string } | null>(null);

  const detected = useMemo(() => {
    if (!remoteInfo?.owner || !remoteInfo.repo) return null;
    return { owner: remoteInfo.owner, repo: remoteInfo.repo };
  }, [remoteInfo]);

  const load = useCallback(async () => {
    if (!open || !agentReady) return;
    setLoading(true);
    setError(null);
    try {
      const [remote, repoList] = await Promise.all([
        window.harness.getGitRemoteInfo({ cwd: projectPath }),
        window.harness.listGithubRepos({ q: query.trim() || undefined }),
      ]);
      setRemoteInfo(remote);
      setRepos(repoList.repos);
      if (remote.owner && remote.repo) {
        setSelected({ owner: remote.owner, repo: remote.repo });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  }, [agentReady, open, projectPath, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setError(null);
      setWarning(null);
      setSelected(null);
      return;
    }
    void load();
  }, [load, open]);

  useEffect(() => {
    if (!open || !agentReady) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [agentReady, load, open, query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleConnect = async () => {
    if (!selected) return;
    setConnecting(true);
    setError(null);
    setWarning(null);
    try {
      const result = await onConnect({
        owner: selected.owner,
        repo: selected.repo,
        remoteUrl: remoteInfo?.remoteUrl,
      });
      if (result?.warning) {
        setWarning(result.warning);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect repository");
    } finally {
      setConnecting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="workflow-modal-overlay app-region-no-drag"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="workflow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-connect-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="github-connect-title" className="workflow-modal-title">
          Connect GitHub repository
        </h3>
        <p className="workflow-modal-subtitle">
          Link this project to a repository where the OpenHarness GitHub App is installed.
        </p>

        {!agentReady ? (
          <>
            <p className="settings-muted workflow-modal-feedback">
              Install the GitHub App in Settings before linking a repository.
            </p>
            <div className="workflow-modal-actions">
              <button
                type="button"
                className="settings-button settings-button-ghost"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-button settings-button-save"
                onClick={() => {
                  onClose();
                  onOpenGithubSettings();
                }}
              >
                Open Settings
              </button>
            </div>
          </>
        ) : (
          <>
            {detected ? (
              <div className="workflow-field">
                <div
                  className="workflow-template-card workflow-template-card-selected"
                  aria-live="polite"
                >
                  <p className="workflow-template-card-title">Detected git origin</p>
                  <p className="workflow-template-card-desc">
                    {detected.owner}/{detected.repo}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="workflow-field">
              <span className="workflow-field-label">Repository</span>
              <div className="workflow-repo-search">
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={14}
                  className="workflow-repo-search-icon"
                  aria-hidden
                />
                <input
                  type="search"
                  className="settings-input workflow-repo-search-input"
                  placeholder="Filter by name…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              <div className="workflow-repo-list">
                {loading ? (
                  <p className="workflow-repo-empty">Loading repositories…</p>
                ) : repos.length === 0 ? (
                  <p className="workflow-repo-empty">No App-installed repositories found.</p>
                ) : (
                  repos.map((repo) => {
                    const isSelected =
                      selected?.owner === repo.owner && selected.repo === repo.name;
                    return (
                      <button
                        key={repo.githubRepoId}
                        type="button"
                        aria-pressed={isSelected}
                        className={`workflow-repo-row${
                          isSelected ? " workflow-repo-row-selected" : ""
                        }`}
                        onClick={() => setSelected({ owner: repo.owner, repo: repo.name })}
                      >
                        {repo.fullName}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {error ? (
              <p className="settings-error workflow-modal-feedback" role="alert">
                {error}
              </p>
            ) : null}
            {warning ? (
              <p className="settings-muted workflow-modal-feedback" role="status">
                {warning}
              </p>
            ) : null}

            <div className="workflow-modal-actions">
              <button
                type="button"
                className="settings-button settings-button-ghost"
                onClick={onClose}
                disabled={connecting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-button settings-button-save"
                disabled={!selected || connecting}
                onClick={() => void handleConnect()}
              >
                {connecting ? "Connecting…" : "Connect"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
