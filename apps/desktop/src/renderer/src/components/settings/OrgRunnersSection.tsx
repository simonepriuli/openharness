import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { remoteKeys } from "../../queries/query-keys";
import {
  useRunnerBindingsQuery,
  useUpsertRunnerBindingMutation,
  useWorkflowRunnerInstanceIdQuery,
} from "../../queries/use-runners";
import { SettingsButton } from "./SettingsButton";
import { SettingsCard } from "./SettingsCard";

export function OrgRunnersSection() {
  const queryClient = useQueryClient();
  const bindingsQuery = useRunnerBindingsQuery();
  const instanceQuery = useWorkflowRunnerInstanceIdQuery();
  const upsertBinding = useUpsertRunnerBindingMutation();
  const [error, setError] = useState<string | null>(null);

  const bindings = bindingsQuery.data?.bindings ?? [];
  const runnerInstanceId = instanceQuery.data?.runnerInstanceId ?? "";
  const loading =
    (bindingsQuery.isPending && !bindingsQuery.data) ||
    (instanceQuery.isPending && !instanceQuery.data);
  const loadError =
    (bindingsQuery.error instanceof Error ? bindingsQuery.error.message : null) ??
    (instanceQuery.error instanceof Error ? instanceQuery.error.message : null);

  const reloadBindings = async () => {
    await queryClient.invalidateQueries({ queryKey: remoteKeys.runners.bindings() });
  };

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
      await reloadBindings();
      return;
    }

    await upsertBinding.mutateAsync({
      connectionId: connection.id,
      projectPath: picked.cwd,
    });
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
      {error || loadError ? (
        <p className="settings-error">{error ?? loadError}</p>
      ) : null}

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
