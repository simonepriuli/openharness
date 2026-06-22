import { useCallback, useEffect, useState } from "react";
import { SettingsButton } from "./SettingsButton";
import { SettingsCard } from "./SettingsCard";

type RunnerBinding = {
  id: string;
  connectionId: string;
  projectPath: string;
  label: string | null;
  owner: string;
  repo: string;
  fullName: string;
  runnerInstanceId: string;
  lastSeenAt: string | null;
};

export function OrgRunnersSection() {
  const [bindings, setBindings] = useState<RunnerBinding[]>([]);
  const [runnerInstanceId, setRunnerInstanceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [bindingsResult, instanceResult] = await Promise.all([
      window.harness.listRunnerBindings(),
      window.harness.getWorkflowRunnerInstanceId(),
    ]);
    setBindings(bindingsResult.bindings);
    setRunnerInstanceId(instanceResult.runnerInstanceId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load runners");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const handleAddPath = async () => {
    const picked = await window.harness.pickDirectory();
    if (picked.canceled) return;

    const remote = await window.harness.getGitRemoteInfo({ cwd: picked.cwd });
    if (!remote.owner || !remote.repo) {
      setError("Selected folder is not a GitHub repository.");
      return;
    }

    const connections = await window.harness.listOrgGithubConnections();
    const connection = connections.connections.find(
      (row) =>
        row.githubOwner.toLowerCase() === remote.owner!.toLowerCase() &&
        row.githubRepo.toLowerCase() === remote.repo!.toLowerCase(),
    );

    if (!connection) {
      await window.harness.connectGithubRepo({
        projectPath: picked.cwd,
        owner: remote.owner,
        repo: remote.repo,
        remoteUrl: remote.remoteUrl,
      });
      await reload();
      return;
    }

    await window.harness.upsertRunnerBinding({
      connectionId: connection.id,
      projectPath: picked.cwd,
    });
    await reload();
    setError(null);
  };

  if (loading) {
    return <p className="settings-muted">Loading runners…</p>;
  }

  const thisMachineBindings = bindings.filter(
    (binding) => binding.runnerInstanceId === runnerInstanceId,
  );

  return (
    <>
      {error ? <p className="settings-error">{error}</p> : null}

      <SettingsCard title="This machine" padded={false}>
        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
            <div className="settings-row-label">Runner id</div>
            <p className="settings-row-description settings-mono text-xs">{runnerInstanceId}</p>
          </div>
          <SettingsButton size="sm" className="self-start" onClick={() => void handleAddPath()}>
            Add local repo path
          </SettingsButton>
        </div>

        {thisMachineBindings.length === 0 ? (
          <p className="settings-muted px-4 pb-4 text-sm">
            No local paths registered on this machine. Add a folder to run org workflows here.
          </p>
        ) : (
          <ul className="settings-list">
            {thisMachineBindings.map((binding) => (
              <li key={binding.id} className="settings-row settings-row-static">
                <div className="settings-row-text min-w-0">
                  <div className="settings-row-label">{binding.fullName}</div>
                  <p className="settings-row-description truncate">{binding.projectPath}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title="Organization runners" padded={false}>
        {bindings.length === 0 ? (
          <p className="settings-muted px-4 py-3 text-sm">No runners registered yet.</p>
        ) : (
          <ul className="settings-list">
            {bindings.map((binding) => (
              <li key={binding.id} className="settings-row settings-row-static">
                <div className="settings-row-text min-w-0">
                  <div className="settings-row-label">{binding.fullName}</div>
                  <p className="settings-row-description truncate">
                    {binding.label ?? binding.runnerInstanceId} · {binding.projectPath}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </>
  );
}
