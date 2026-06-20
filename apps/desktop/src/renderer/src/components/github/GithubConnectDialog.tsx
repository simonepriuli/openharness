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

  const handleConnect = async (owner: string, repo: string) => {
    setConnecting(true);
    setError(null);
    setWarning(null);
    try {
      const result = await onConnect({
        owner,
        repo,
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
    <div className="github-connect-overlay app-region-no-drag" role="presentation" onClick={onClose}>
      <div
        className="github-connect-dialog workspace-panel-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-connect-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workspace-panel p-4">
          <h3 id="github-connect-title" className="text-base font-medium text-slate-900 dark:text-neutral-100">
            Connect GitHub repository
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
            Link this project to a repository where the OpenHarness GitHub App is installed.
          </p>

          {!agentReady ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-600 dark:text-neutral-400">
                Install the GitHub App in Settings before linking a repository.
              </p>
              <button
                type="button"
                className="settings-button settings-button-primary"
                onClick={() => {
                  onClose();
                  onOpenGithubSettings();
                }}
              >
                Open Settings → GitHub
              </button>
            </div>
          ) : (
            <>
              {detected ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/[0.08] dark:bg-[#262626]">
                  <p className="text-sm text-slate-700 dark:text-neutral-300">
                    Detected git origin:{" "}
                    <span className="font-medium">
                      {detected.owner}/{detected.repo}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="settings-button settings-button-primary mt-3"
                    disabled={connecting}
                    onClick={() => void handleConnect(detected.owner, detected.repo)}
                  >
                    {connecting ? "Connecting…" : `Connect to ${detected.owner}/${detected.repo}`}
                  </button>
                </div>
              ) : null}

              <div className="mt-4">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-neutral-500">
                  Or choose a repository
                </label>
                <div className="relative">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={14}
                    strokeWidth={1.6}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <input
                    type="search"
                    className="settings-api-input pl-9"
                    placeholder="Search repositories"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/[0.08]">
                {loading ? (
                  <p className="p-3 text-sm text-slate-500 dark:text-neutral-400">Loading repositories…</p>
                ) : repos.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500 dark:text-neutral-400">
                    No App-installed repositories found.
                  </p>
                ) : (
                  <ul>
                    {repos.map((repo) => {
                      const isSelected =
                        selected?.owner === repo.owner && selected.repo === repo.name;
                      return (
                        <li key={repo.githubRepoId}>
                          <button
                            type="button"
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04] ${
                              isSelected ? "bg-slate-50 dark:bg-white/[0.06]" : ""
                            }`}
                            onClick={() => setSelected({ owner: repo.owner, repo: repo.name })}
                          >
                            <span className="font-medium text-slate-800 dark:text-neutral-200">
                              {repo.fullName}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {selected ? (
                <button
                  type="button"
                  className="settings-button settings-button-primary mt-4"
                  disabled={connecting}
                  onClick={() => void handleConnect(selected.owner, selected.repo)}
                >
                  {connecting ? "Connecting…" : `Connect to ${selected.owner}/${selected.repo}`}
                </button>
              ) : null}
            </>
          )}

          {error ? (
            <p className="settings-error mt-3" role="alert">
              {error}
            </p>
          ) : null}
          {warning ? (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400" role="status">
              {warning}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button type="button" className="settings-button settings-button-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
