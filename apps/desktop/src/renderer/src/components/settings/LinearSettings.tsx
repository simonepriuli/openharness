import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../hooks/useAuthUser";
import {
  useDeleteLinearInstallationMutation,
  useDeleteLinearMappingMutation,
  useLinearMappingsQuery,
  useLinearProjectsQuery,
  useLinearStatusQuery,
  useOpenLinearConnectMutation,
  useUpsertLinearMappingMutation,
} from "../../queries/use-linear";
import { remoteKeys } from "../../queries/query-keys";
import { SettingsCard } from "./SettingsCard";
import { SettingsButton } from "./SettingsButton";
import {
  WorkflowRepoPicker,
  type IntegrationRepoSelection,
} from "./workflows/WorkflowRepoPicker";

export function LinearSettings() {
  const queryClient = useQueryClient();
  const { user, loading: userLoading } = useAuthUser();
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<IntegrationRepoSelection | null>(null);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [addMappingOpen, setAddMappingOpen] = useState(false);

  const statusQuery = useLinearStatusQuery();
  const mappingsQuery = useLinearMappingsQuery();
  const projectsQuery = useLinearProjectsQuery();
  const openLinearConnect = useOpenLinearConnectMutation();
  const upsertMapping = useUpsertLinearMappingMutation();
  const deleteMapping = useDeleteLinearMappingMutation();
  const deleteInstallation = useDeleteLinearInstallationMutation();

  const status = statusQuery.data ?? null;
  const mappings = mappingsQuery.data?.mappings ?? status?.mappings ?? [];
  const projects = projectsQuery.data?.projects ?? [];
  const installation = status?.installation ?? null;

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectId("");
      return;
    }
    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]!.id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.status() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.mappings() });
      void queryClient.invalidateQueries({ queryKey: remoteKeys.linear.projects() });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient]);

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      await openLinearConnect.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open Linear connect page");
    }
  }, [openLinearConnect]);

  const handleDisconnect = useCallback(async () => {
    setError(null);
    try {
      await deleteInstallation.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Linear");
    }
  }, [deleteInstallation]);

  const handleCancelAddMapping = useCallback(() => {
    setAddMappingOpen(false);
    setSelectedRepo(null);
    setRepoPickerOpen(false);
    setError(null);
  }, []);

  const handleSaveMapping = useCallback(async () => {
    if (!installation || !selectedProject || !selectedRepo) {
      setError("Select a Linear project and repository.");
      return;
    }
    setError(null);
    try {
      await upsertMapping.mutateAsync({
        installationId: installation.id,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        provider: selectedRepo.provider,
        namespace: selectedRepo.owner,
        repoName: selectedRepo.repo,
      });
      setSelectedRepo(null);
      setAddMappingOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project mapping");
    }
  }, [installation, selectedProject, selectedRepo, upsertMapping]);

  if (userLoading) return null;
  if (!user) return null;

  return (
    <SettingsCard title="Linear" className="settings-integration-card">
      {!status?.configured ? (
        <p className="settings-muted text-sm">
          Linear OAuth is not configured on the server. Set LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET,
          and LINEAR_OAUTH_REDIRECT_URI.
        </p>
      ) : (
        <>
          <p className="settings-muted text-sm settings-section-lead">
            Connect Linear so agents can use issue tools and workflows can trigger from Linear
            events.
          </p>

          {error ? <p className="settings-error text-sm">{error}</p> : null}

          <div className="settings-row">
            <div>
              <p className="settings-row-label">Workspace</p>
              <p className="settings-muted text-sm">
                {status.connected && installation
                  ? installation.workspaceName
                  : "Not connected"}
              </p>
            </div>
            {status.connected ? (
              <SettingsButton variant="secondary" onClick={() => void handleDisconnect()}>
                Disconnect
              </SettingsButton>
            ) : (
              <SettingsButton onClick={() => void handleConnect()}>Connect Linear</SettingsButton>
            )}
          </div>

          {status.connected ? (
            <>
              <div className="settings-divider" />
              <div className="settings-row">
                <div>
                  <p className="settings-row-label">Project mappings</p>
                  <p className="settings-muted text-sm">
                    Map Linear projects to repositories for workflow triggers.
                  </p>
                </div>
                <SettingsButton size="sm" onClick={() => setAddMappingOpen(true)}>
                  <HugeiconsIcon icon={Add01Icon} size={14} />
                  Add mapping
                </SettingsButton>
              </div>

              {mappings.length === 0 ? (
                <p className="settings-muted text-sm">No project mappings yet.</p>
              ) : (
                <ul className="settings-mapping-list">
                  {mappings.map((mapping) => (
                    <li key={mapping.id} className="settings-mapping-row">
                      <div>
                        <strong>{mapping.projectName}</strong>
                        <span className="settings-muted">
                          {" "}
                          → {mapping.namespace}/{mapping.repoName}
                        </span>
                      </div>
                      <SettingsButton
                        size="sm"
                        variant="secondary"
                        onClick={() => void deleteMapping.mutateAsync(mapping.id)}
                      >
                        Remove
                      </SettingsButton>
                    </li>
                  ))}
                </ul>
              )}

              {addMappingOpen ? (
                <div className="settings-mapping-form">
                  <label className="settings-field">
                    <span className="settings-field-label">Linear project</span>
                    <select
                      className="settings-input"
                      value={selectedProjectId}
                      onChange={(event) => setSelectedProjectId(event.target.value)}
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="settings-field">
                    <span className="settings-field-label">Repository</span>
                    <SettingsButton
                      variant="secondary"
                      onClick={() => setRepoPickerOpen(true)}
                    >
                      {selectedRepo
                        ? `${selectedRepo.owner}/${selectedRepo.repo}`
                        : "Select repository"}
                    </SettingsButton>
                  </label>

                  <div className="settings-mapping-form-actions">
                    <SettingsButton variant="secondary" onClick={handleCancelAddMapping}>
                      Cancel
                    </SettingsButton>
                    <SettingsButton onClick={() => void handleSaveMapping()}>
                      Save mapping
                    </SettingsButton>
                  </div>
                </div>
              ) : null}

              <WorkflowRepoPicker
                open={repoPickerOpen}
                owner={selectedRepo?.owner ?? ""}
                repo={selectedRepo?.repo ?? ""}
                provider={selectedRepo?.provider ?? "github"}
                includeAzureDevOps
                onClose={() => setRepoPickerOpen(false)}
                onRepoChange={() => {}}
                onIntegrationRepoChange={setSelectedRepo}
              />
            </>
          ) : null}
        </>
      )}
    </SettingsCard>
  );
}
