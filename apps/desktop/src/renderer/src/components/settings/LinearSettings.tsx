import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LinearIcon } from "../icons/LinearIcon";
import { useAuthUser } from "../../hooks/useAuthUser";
import {
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
import { LinearProjectPicker } from "./LinearProjectPicker";

export function LinearSettings() {
  const queryClient = useQueryClient();
  const { user, loading: userLoading } = useAuthUser();
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<IntegrationRepoSelection | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(false);
  const [addMappingOpen, setAddMappingOpen] = useState(false);

  const statusQuery = useLinearStatusQuery();
  const mappingsQuery = useLinearMappingsQuery();
  const openLinearConnect = useOpenLinearConnectMutation();
  const upsertMapping = useUpsertLinearMappingMutation();
  const deleteMapping = useDeleteLinearMappingMutation();

  const status = statusQuery.data ?? null;
  const connected = status?.connected ?? false;
  const agentReady = status?.agentReady ?? false;
  const installation = status?.installation ?? null;
  const mappings = mappingsQuery.data?.mappings ?? status?.mappings ?? [];

  const projectsQuery = useLinearProjectsQuery(connected);
  const projects = projectsQuery.data?.projects ?? [];

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

  const handleCancelAddMapping = useCallback(() => {
    setAddMappingOpen(false);
    setSelectedProjectId("");
    setSelectedRepo(null);
    setProjectPickerOpen(false);
    setRepoPickerOpen(false);
    setError(null);
  }, []);

  const handleSaveMapping = useCallback(async () => {
    if (!installation || !selectedProject || !selectedRepo) {
      setError("Select a project and repository.");
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
      setSelectedProjectId("");
      setSelectedRepo(null);
      setAddMappingOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project mapping");
    }
  }, [installation, selectedProject, selectedRepo, upsertMapping]);

  const handleDeleteMapping = useCallback(
    async (mappingId: string) => {
      setError(null);
      try {
        await deleteMapping.mutateAsync(mappingId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete mapping");
      }
    },
    [deleteMapping],
  );

  if ((statusQuery.isPending && !status) || userLoading) {
    return <p className="settings-muted">Loading Linear integration...</p>;
  }
  if (!user) return <p className="settings-muted">Sign in to connect Linear.</p>;

  if (!status?.configured) {
    return (
      <SettingsCard title="Linear" titleIcon={<LinearIcon size={16} />}>
        <p className="settings-muted text-sm">
          Linear integration is not configured on the server. Ask your OpenHarness administrator to
          configure the Linear OAuth environment variables.
        </p>
      </SettingsCard>
    );
  }

  const hasProject = Boolean(selectedProject);
  const hasRepo = Boolean(selectedRepo);
  const projectsError =
    projectsQuery.isError && projectsQuery.error instanceof Error
      ? projectsQuery.error.message
      : projectsQuery.isError
        ? "Failed to load projects"
        : null;

  return (
    <SettingsCard padded={false} overflowVisible>
      <div className="settings-row settings-row-static settings-row-static-top">
        <div className="settings-row-text">
          <div className="settings-row-label settings-row-label-with-icon">
            <LinearIcon size={16} />
            Linear
          </div>
          <p className="settings-row-description">
            Connect Linear so agents can use issue tools and workflows can trigger from Linear
            events, then map one project per repository for workflow triggers. Configure native
            @mention and delegate agent behavior in Organization → Linear Agents.
          </p>
        </div>
        <button
          type="button"
          className="settings-button settings-button-secondary settings-action-button"
          onClick={() => void handleConnect()}
          disabled={openLinearConnect.isPending}
        >
          {openLinearConnect.isPending ? "Opening Linear..." : connected ? "Reconnect" : "Connect"}
        </button>
      </div>

      {connected && !agentReady ? (
        <div className="settings-row settings-row-static">
          <p className="settings-muted text-sm settings-row-description">
            Reconnect Linear to grant agent scopes for @mention and delegate handling. Workflow
            automations continue to work with your current connection.
          </p>
        </div>
      ) : null}

      {connected ? (
        <div className="settings-row settings-row-stack workflow-detail-card-popover-host">
          <div className="workflow-detail-section-header">
            <h3 className="workflow-detail-label">Project mappings</h3>
            {!addMappingOpen ? (
              <SettingsButton
                size="sm"
                className="shrink-0"
                onClick={() => setAddMappingOpen(true)}
              >
                <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} aria-hidden />
                Add mapping
              </SettingsButton>
            ) : null}
          </div>

          {mappings.length > 0 ? (
            <ul className="settings-muted text-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {mappings.map((mapping) => (
                <li
                  key={mapping.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.5rem 0" }}
                >
                  <span>
                    <strong>{mapping.projectName}</strong> {"->"} {mapping.namespace}/{mapping.repoName}
                  </span>
                  <SettingsButton
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => void handleDeleteMapping(mapping.id)}
                  >
                    Remove
                  </SettingsButton>
                </li>
              ))}
            </ul>
          ) : !addMappingOpen ? (
            <p className="settings-muted text-sm" style={{ margin: 0 }}>
              No project mappings yet.
            </p>
          ) : null}

          {addMappingOpen ? (
            <>
              {installation ? (
                <p className="settings-muted text-sm" style={{ margin: 0 }}>
                  Workspace: <strong>{installation.workspaceName}</strong>
                </p>
              ) : null}
              <div
                className="settings-form-grid"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}
              >
                <label className="settings-field">
                  <span>Project</span>
                  <div className="workflow-detail-repo">
                    <button
                      type="button"
                      className={`workflow-detail-select-trigger settings-input${
                        hasProject
                          ? " workflow-detail-select-trigger-selected"
                          : " workflow-detail-select-trigger-placeholder"
                      }`}
                      aria-expanded={projectPickerOpen}
                      disabled={projectsQuery.isPending}
                      onClick={() => {
                        setRepoPickerOpen(false);
                        setProjectPickerOpen((open) => !open);
                      }}
                      style={{ width: "100%", textAlign: "left" }}
                    >
                      <span className="workflow-detail-select-trigger-label">
                        {hasProject ? selectedProject!.name : "Select project..."}
                      </span>
                      <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        size={14}
                        strokeWidth={1.8}
                        className="workflow-detail-select-trigger-icon"
                        aria-hidden
                      />
                    </button>
                    <LinearProjectPicker
                      open={projectPickerOpen}
                      projects={projects}
                      projectId={selectedProjectId}
                      loading={projectsQuery.isPending || projectsQuery.isFetching}
                      error={projectsError}
                      onClose={() => setProjectPickerOpen(false)}
                      onProjectChange={setSelectedProjectId}
                    />
                  </div>
                </label>
                <label className="settings-field">
                  <span>Repository</span>
                  <div className="workflow-detail-repo">
                    <button
                      type="button"
                      className={`workflow-detail-select-trigger settings-input${
                        hasRepo
                          ? " workflow-detail-select-trigger-selected"
                          : " workflow-detail-select-trigger-placeholder"
                      }`}
                      aria-expanded={repoPickerOpen}
                      onClick={() => {
                        setProjectPickerOpen(false);
                        setRepoPickerOpen((open) => !open);
                      }}
                      style={{ width: "100%", textAlign: "left" }}
                    >
                      <span className="workflow-detail-select-trigger-label">
                        {hasRepo ? selectedRepo!.fullName : "Select repository"}
                      </span>
                      <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        size={14}
                        strokeWidth={1.8}
                        className="workflow-detail-select-trigger-icon"
                        aria-hidden
                      />
                    </button>
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
                  </div>
                </label>
              </div>
              <div className="settings-api-actions">
                <SettingsButton
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={handleCancelAddMapping}
                  disabled={upsertMapping.isPending}
                >
                  Cancel
                </SettingsButton>
                <SettingsButton
                  size="sm"
                  variant="save"
                  className="shrink-0"
                  onClick={() => void handleSaveMapping()}
                  disabled={upsertMapping.isPending}
                >
                  {upsertMapping.isPending ? "Saving..." : "Save mapping"}
                </SettingsButton>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="settings-error text-sm">{error}</p> : null}
    </SettingsCard>
  );
}
