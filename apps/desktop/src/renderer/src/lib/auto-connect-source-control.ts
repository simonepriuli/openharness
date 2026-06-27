type SourceControlProviderId = "github" | "azure_devops";

export async function tryAutoConnectSourceControl(
  projectPath: string,
  options?: { authenticated?: boolean },
): Promise<boolean> {
  if (options?.authenticated === false) return false;

  try {
    const existing = await window.harness.getGithubConnection({ projectPath });
    if (existing.connected === true) return false;

    const remote = await window.harness.getGitRemoteInfo({ cwd: projectPath });
    const provider = remote.provider as SourceControlProviderId | null;
    if (!provider || !remote.owner || !remote.repo) return false;

    const { connections } = await window.harness.listOrgGithubConnections();
    const orgConnection = connections.find(
      (row) =>
        (row.provider ?? "github") === provider &&
        row.githubOwner.toLowerCase() === remote.owner!.toLowerCase() &&
        row.githubRepo.toLowerCase() === remote.repo!.toLowerCase(),
    );

    if (orgConnection) {
      await window.harness.upsertRunnerBinding({
        connectionId: orgConnection.id,
        projectPath,
      });
      return true;
    }

    const result = await window.harness.connectSourceControlRepo({
      provider,
      projectPath,
      owner: remote.owner,
      repo: remote.repo,
      remoteUrl: remote.remoteUrl,
    });
    return result.connected === true;
  } catch (err) {
    console.debug("[auto-connect-source-control]", projectPath, err);
    return false;
  }
}
