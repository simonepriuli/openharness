import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useMemo, useState } from "react";
import type { LinearAgentConfigRow, WorkflowTools } from "../../../../preload/api";
import { LinearIcon } from "../icons/LinearIcon";
import {
  useLinearAgentConfigsQuery,
  useLinearStatusQuery,
  useOpenLinearConnectMutation,
  useUpsertLinearAgentConfigMutation,
} from "../../queries/use-linear";
import { LinearAgentRunsView } from "./LinearAgentRunsView";
import { SettingsButton } from "./SettingsButton";
import { SettingsCard } from "./SettingsCard";
import { SettingsModelPicker } from "./SettingsModelPicker";
import { SettingsTabs } from "./SettingsTabs";
import { SettingsToggle } from "./SettingsToggle";
import { WorkflowBranchPicker } from "./workflows/WorkflowBranchPicker";

export type LinearAgentsTab = "setup" | "runs";

const LINEAR_AGENTS_TABS = [
  { id: "setup", label: "Setup" },
  { id: "runs", label: "Runs" },
] as const;

type LinearToolKey = "linearRead" | "linearWrite" | "linearComments";
type GitToolKey = "prPush" | "prCreate";

const LINEAR_TOOL_ROWS: Array<{ key: LinearToolKey; label: string }> = [
  { key: "linearRead", label: "Linear read" },
  { key: "linearWrite", label: "Linear write" },
  { key: "linearComments", label: "Linear comments" },
];

const GIT_TOOL_ROWS: Array<{ key: GitToolKey; label: string }> = [
  { key: "prPush", label: "Push branch" },
  { key: "prCreate", label: "Create pull request" },
];

function LinearAgentMappingCard({
  row,
  canEnable,
  disabledReason,
  onSave,
  saving,
}: {
  row: LinearAgentConfigRow;
  canEnable: boolean;
  disabledReason: string | null;
  onSave: (patch: {
    enabled?: boolean;
    model?: string;
    targetBranch?: string;
    tools?: WorkflowTools;
  }) => Promise<void>;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState(row.enabled);
  const [model, setModel] = useState(row.model);
  const [targetBranch, setTargetBranch] = useState(row.targetBranch || "main");
  const [branchOpen, setBranchOpen] = useState(false);
  const [tools, setTools] = useState<WorkflowTools>(row.tools);
  const [error, setError] = useState<string | null>(null);

  const owner = row.namespace;
  const repo = row.repoName;
  const hasRepo = Boolean(owner && repo);

  const dirty =
    enabled !== row.enabled ||
    model !== row.model ||
    targetBranch !== (row.targetBranch || "main") ||
    JSON.stringify(tools) !== JSON.stringify(row.tools);

  const handleSave = useCallback(async () => {
    setError(null);
    try {
      await onSave({
        enabled: canEnable ? enabled : false,
        model,
        targetBranch,
        tools,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent config");
    }
  }, [canEnable, enabled, model, onSave, targetBranch, tools]);

  const toggleTool = (key: keyof WorkflowTools) => {
    setTools((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <section className="settings-group settings-group-overflow-visible linear-agent-card">
      <div className="settings-row settings-row-static">
        <div className="settings-row-text">
          <div className="settings-row-label">{row.projectName}</div>
          <div className="settings-row-description">
            {row.namespace}/{row.repoName}
          </div>
        </div>
        <SettingsToggle
          label={`Enable Linear agent for ${row.projectName}`}
          checked={enabled}
          disabled={!canEnable || saving}
          onChange={setEnabled}
        />
      </div>

      {!canEnable && disabledReason ? (
        <div className="settings-row">
          <p className="settings-row-description">{disabledReason}</p>
        </div>
      ) : null}

      <div className="settings-row settings-row-static">
        <div className="settings-row-text">
          <div className="settings-row-label">Target branch</div>
          <div className="settings-row-description">Branch the agent checks out for each run.</div>
        </div>
        <div className="linear-agent-control workflow-detail-repo">
          <button
            type="button"
            className={`workflow-detail-select-trigger${
              targetBranch
                ? " workflow-detail-select-trigger-selected"
                : " workflow-detail-select-trigger-placeholder"
            }`}
            aria-expanded={branchOpen}
            aria-label={`Target branch: ${targetBranch || "Select branch"}`}
            disabled={saving || !hasRepo}
            onClick={() => setBranchOpen((open) => !open)}
          >
            <span className="workflow-detail-select-trigger-label">
              {targetBranch || "Select branch"}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={14}
              strokeWidth={1.8}
              className="workflow-detail-select-trigger-icon"
              aria-hidden
            />
          </button>
          {hasRepo ? (
            <WorkflowBranchPicker
              open={branchOpen}
              owner={owner}
              repo={repo}
              branch={targetBranch}
              onClose={() => setBranchOpen(false)}
              onBranchChange={setTargetBranch}
            />
          ) : null}
        </div>
      </div>

      <div className="settings-row settings-row-static">
        <div className="settings-row-text">
          <div className="settings-row-label">Model</div>
          <div className="settings-row-description">Model used for this project's agent sessions.</div>
        </div>
        <SettingsModelPicker
          value={model}
          onChange={setModel}
          sessionKey={null}
          allowEmpty
          emptyLabel="Default model"
          emptyOptionLabel="Default model"
          panelAriaLabel="Select agent model"
          listAriaLabel="Agent models"
          disabled={saving}
        />
      </div>

      <div className="settings-row settings-row-stack">
        <div className="settings-row-text">
          <div className="settings-row-label">Permissions</div>
          <div className="settings-row-description">Tools the agent may use during a run.</div>
        </div>
        <div className="linear-agent-permissions">
          {[...LINEAR_TOOL_ROWS, ...GIT_TOOL_ROWS].map((toolRow) => (
            <div key={toolRow.key} className="linear-agent-permission">
              <span>{toolRow.label}</span>
              <SettingsToggle
                label={toolRow.label}
                checked={Boolean(tools[toolRow.key])}
                onChange={() => toggleTool(toolRow.key)}
                disabled={saving}
              />
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div className="settings-row">
          <p className="settings-error">{error}</p>
        </div>
      ) : null}

      {dirty ? (
        <div className="settings-row settings-row-static linear-agent-footer">
          <SettingsButton
            size="sm"
            variant="save"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </SettingsButton>
        </div>
      ) : null}
    </section>
  );
}

function LinearAgentsSetupPanel({
  connected,
  agentReady,
  cloudReady,
  canEnableAgent,
  disabledReason,
  configs,
  connectError,
  openLinearConnectPending,
  upsertConfigPending,
  onReconnect,
  onSave,
}: {
  connected: boolean;
  agentReady: boolean;
  cloudReady: boolean;
  canEnableAgent: boolean;
  disabledReason: string | null;
  configs: LinearAgentConfigRow[];
  connectError: string | null;
  openLinearConnectPending: boolean;
  upsertConfigPending: boolean;
  onReconnect: () => void;
  onSave: (
    mappingId: string,
    patch: {
      enabled?: boolean;
      model?: string;
      targetBranch?: string;
      tools?: WorkflowTools;
    },
  ) => Promise<void>;
}) {
  return (
    <>
      {!connected ? (
        <SettingsCard title="Linear not connected" titleIcon={<LinearIcon size={16} />}>
          <p className="settings-muted text-sm">
            Connect Linear under Organization → Integrations, add project mappings, then return here
            to enable the agent.
          </p>
        </SettingsCard>
      ) : null}

      {connected && !agentReady ? (
        <SettingsCard padded={false}>
          <div className="settings-row settings-row-static settings-row-static-top">
            <div className="settings-row-text">
              <p className="settings-row-description">
                Your Linear connection is missing agent scopes. Reconnect to enable @mention and
                delegate handling.
              </p>
            </div>
            <button
              type="button"
              className="settings-button settings-button-secondary settings-action-button"
              onClick={onReconnect}
              disabled={openLinearConnectPending}
            >
              {openLinearConnectPending ? "Opening Linear…" : "Reconnect Linear"}
            </button>
          </div>
          {connectError ? <p className="settings-error settings-row-feedback">{connectError}</p> : null}
        </SettingsCard>
      ) : null}

      {connected && agentReady && !cloudReady ? (
        <SettingsCard>
          <p className="settings-muted text-sm">
            Cloud workers are required for the Linear agent. Enable cloud workers in Organization →
            Details and ensure your OpenHarness deployment has cloud worker infrastructure configured.
          </p>
        </SettingsCard>
      ) : null}

      {connected ? (
        configs.length > 0 ? (
          configs.map((row) => (
            <LinearAgentMappingCard
              key={row.mappingId}
              row={row}
              canEnable={canEnableAgent}
              disabledReason={disabledReason}
              saving={upsertConfigPending}
              onSave={(patch) => onSave(row.mappingId, patch)}
            />
          ))
        ) : (
          <SettingsCard>
            <p className="settings-muted text-sm">
              No Linear project mappings yet. Add mappings under Organization → Integrations.
            </p>
          </SettingsCard>
        )
      ) : null}
    </>
  );
}

export function LinearAgentsSettingsView({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<LinearAgentsTab>("setup");
  const statusQuery = useLinearStatusQuery();
  const configsQuery = useLinearAgentConfigsQuery();
  const openLinearConnect = useOpenLinearConnectMutation();
  const upsertConfig = useUpsertLinearAgentConfigMutation();
  const [connectError, setConnectError] = useState<string | null>(null);

  const status = statusQuery.data ?? null;
  const connected = status?.connected ?? false;
  const configured = status?.configured ?? false;
  const agentReady = configsQuery.data?.agentReady ?? status?.agentReady ?? false;
  const cloudWorkersEnabled =
    configsQuery.data?.cloudWorkersEnabled ?? status?.cloudWorkersEnabled ?? false;
  const cloudInfraConfigured =
    configsQuery.data?.cloudInfraConfigured ?? status?.cloudInfraConfigured ?? false;

  const configs = configsQuery.data?.configs ?? [];

  const cloudReady = cloudWorkersEnabled && cloudInfraConfigured;
  const canEnableAgent = connected && agentReady && cloudReady;

  const disabledReason = useMemo(() => {
    if (!connected) return "Connect Linear on the Integrations tab first.";
    if (!agentReady) return "Reconnect Linear to grant agent scopes (app:assignable, app:mentionable).";
    if (!cloudReady) {
      return "Cloud workers must be enabled and configured before the Linear agent can run.";
    }
    return null;
  }, [agentReady, cloudReady, connected]);

  const handleReconnect = useCallback(async () => {
    setConnectError(null);
    try {
      await openLinearConnect.mutateAsync();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Failed to open Linear connect page");
    }
  }, [openLinearConnect]);

  const handleSave = useCallback(
    async (
      mappingId: string,
      patch: {
        enabled?: boolean;
        model?: string;
        targetBranch?: string;
        tools?: WorkflowTools;
      },
    ) => {
      await upsertConfig.mutateAsync({ mappingId, ...patch });
    },
    [upsertConfig],
  );

  if (!configured) {
    return (
      <SettingsCard title="Linear Agents" titleIcon={<LinearIcon size={16} />}>
        <p className="settings-muted text-sm">
          Linear integration is not configured on the server. Ask your OpenHarness administrator to
          configure the Linear OAuth environment variables.
        </p>
      </SettingsCard>
    );
  }

  return (
    <div className={embedded ? undefined : "settings-panel"}>
      {!embedded ? (
        <h2 className="settings-panel-title">Linear Agents</h2>
      ) : null}

      <SettingsTabs
        variant="pill"
        className="linear-agents-settings-tabs"
        value={tab}
        onChange={setTab}
        ariaLabel="Linear Agents sections"
        items={LINEAR_AGENTS_TABS}
      />

      <div className="linear-agents-settings-body">
        {tab === "setup" ? (
          <LinearAgentsSetupPanel
            connected={connected}
            agentReady={agentReady}
            cloudReady={cloudReady}
            canEnableAgent={canEnableAgent}
            disabledReason={disabledReason}
            configs={configs}
            connectError={connectError}
            openLinearConnectPending={openLinearConnect.isPending}
            upsertConfigPending={upsertConfig.isPending}
            onReconnect={() => void handleReconnect()}
            onSave={handleSave}
          />
        ) : connected ? (
          <LinearAgentRunsView />
        ) : (
          <SettingsCard>
            <p className="settings-muted text-sm">
              Connect Linear under Organization → Integrations to view agent runs.
            </p>
          </SettingsCard>
        )}
      </div>
    </div>
  );
}
