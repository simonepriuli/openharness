import { useCallback, useMemo, useState } from "react";
import type { LinearAgentConfigRow, WorkflowTools } from "../../../../preload/api";
import { LinearIcon } from "../icons/LinearIcon";
import {
  useLinearAgentConfigsQuery,
  useLinearAgentSessionsQuery,
  useLinearStatusQuery,
  useOpenLinearConnectMutation,
  useUpsertLinearAgentConfigMutation,
} from "../../queries/use-linear";
import { SettingsButton } from "./SettingsButton";
import { SettingsCard } from "./SettingsCard";
import { SettingsModelPicker } from "./SettingsModelPicker";
import { SettingsToggle } from "./SettingsToggle";

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
    instructions?: string;
    targetBranch?: string;
    tools?: WorkflowTools;
  }) => Promise<void>;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState(row.enabled);
  const [model, setModel] = useState(row.model);
  const [instructions, setInstructions] = useState(row.instructions);
  const [targetBranch, setTargetBranch] = useState(row.targetBranch || "main");
  const [tools, setTools] = useState<WorkflowTools>(row.tools);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    enabled !== row.enabled ||
    model !== row.model ||
    instructions !== row.instructions ||
    targetBranch !== (row.targetBranch || "main") ||
    JSON.stringify(tools) !== JSON.stringify(row.tools);

  const handleSave = useCallback(async () => {
    setError(null);
    try {
      await onSave({
        enabled: canEnable ? enabled : false,
        model,
        instructions,
        targetBranch,
        tools,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent config");
    }
  }, [canEnable, enabled, instructions, model, onSave, targetBranch, tools]);

  const toggleTool = (key: keyof WorkflowTools) => {
    setTools((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="workflow-detail-card" style={{ marginBottom: "1rem" }}>
      <div className="workflow-detail-section-header">
        <div>
          <h3 className="workflow-detail-label">{row.projectName}</h3>
          <p className="settings-muted text-sm">
            {row.namespace}/{row.repoName}
          </p>
        </div>
        <div className="workflow-tool-row" style={{ gap: "0.75rem" }}>
          <span>Enabled</span>
          <SettingsToggle
            label={`Enable Linear agent for ${row.projectName}`}
            checked={enabled}
            disabled={!canEnable || saving}
            onChange={setEnabled}
          />
        </div>
      </div>

      {!canEnable && disabledReason ? (
        <p className="settings-muted text-sm settings-row-feedback">{disabledReason}</p>
      ) : null}

      <div className="settings-row settings-row-stack">
        <label className="settings-field">
          <span className="settings-field-label">Target branch</span>
          <input
            className="settings-input"
            value={targetBranch}
            onChange={(event) => setTargetBranch(event.target.value)}
            disabled={saving}
          />
        </label>

        <label className="settings-field">
          <span className="settings-field-label">Instructions</span>
          <textarea
            className="settings-input"
            rows={6}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            disabled={saving}
            placeholder="Optional instructions for the Linear agent when @mentioned or delegated on issues in this project."
          />
        </label>

        <div className="workflow-instructions-footer">
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

        <div className="workflow-detail-card workflow-tools-card">
          {LINEAR_TOOL_ROWS.map((toolRow) => (
            <div key={toolRow.key} className="workflow-tool-row">
              <span>{toolRow.label}</span>
              <SettingsToggle
                label={toolRow.label}
                checked={Boolean(tools[toolRow.key])}
                onChange={() => toggleTool(toolRow.key)}
                disabled={saving}
              />
            </div>
          ))}
          {GIT_TOOL_ROWS.map((toolRow) => (
            <div key={toolRow.key} className="workflow-tool-row">
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

        {error ? <p className="settings-error settings-row-feedback">{error}</p> : null}

        {dirty ? (
          <SettingsButton size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save agent config"}
          </SettingsButton>
        ) : null}
      </div>
    </div>
  );
}

export function LinearAgentsSettingsView({ embedded = false }: { embedded?: boolean }) {
  const statusQuery = useLinearStatusQuery();
  const configsQuery = useLinearAgentConfigsQuery();
  const sessionsQuery = useLinearAgentSessionsQuery();
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
  const sessions = sessionsQuery.data?.sessions ?? [];

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
        instructions?: string;
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
        <>
          <h2 className="settings-panel-title">Linear Agents</h2>
          <p className="settings-muted settings-section-lead">
            Configure native Linear agent behavior per project mapping. @mention or delegate OpenHarness
            on issues to start an agent session. Runs execute on cloud workers only.
          </p>
        </>
      ) : null}

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
              onClick={() => void handleReconnect()}
              disabled={openLinearConnect.isPending}
            >
              {openLinearConnect.isPending ? "Opening Linear…" : "Reconnect Linear"}
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
              saving={upsertConfig.isPending}
              onSave={(patch) => handleSave(row.mappingId, patch)}
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

      {connected && sessions.length > 0 ? (
        <SettingsCard title="Recent agent sessions">
          <ul className="settings-muted text-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {sessions.map((session) => (
              <li
                key={session.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.5rem 0",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <span>
                  {session.issueIdentifier ?? session.linearIssueId ?? "Issue"} · {session.status}
                </span>
                <span>{new Date(session.updatedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </SettingsCard>
      ) : null}
    </div>
  );
}
