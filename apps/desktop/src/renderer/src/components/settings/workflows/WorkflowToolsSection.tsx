import type { WorkflowTools, WorkflowTrigger } from "../../../../../preload/api";
import { DiscordIcon } from "../../icons/DiscordIcon";
import { useDiscordStatusQuery } from "../../../queries/use-discord";
import { useLinearStatusQuery } from "../../../queries/use-linear";
import { useGithubStatusQuery } from "../../../queries/use-github";
import { useTeamsStatusQuery } from "../../../queries/use-teams";
import { SettingsToggle } from "../SettingsToggle";
import {
  hasDiscordMentionTrigger,
  hasGitPrTrigger,
  hasLinearTrigger,
  hasScheduleTrigger,
  hasTeamsMentionTrigger,
} from "./workflow-trigger-utils";

type WorkflowGithubActionsSectionProps = {
  tools: WorkflowTools;
  triggers: WorkflowTrigger[];
  onChange: (tools: WorkflowTools) => void;
};

type GithubActionKey = "prComment" | "prApprove" | "prPush" | "prCreate";

const GITHUB_ACTION_ROWS: Array<{ key: GithubActionKey; label: string }> = [
  { key: "prComment", label: "Review Pull Request" },
  { key: "prApprove", label: "Approve Pull Request" },
  { key: "prCreate", label: "Create Pull Request" },
  { key: "prPush", label: "Push Branch to GitHub" },
];

export function WorkflowGithubActionsSection({
  tools,
  triggers,
  onChange,
}: WorkflowGithubActionsSectionProps) {
  const githubStatusQuery = useGithubStatusQuery();
  const githubActionsReady = githubStatusQuery.data?.agentReady ?? false;

  if (!hasGitPrTrigger(triggers) || !githubActionsReady) return null;

  const toggle = (key: GithubActionKey) => {
    onChange({ ...tools, [key]: !tools[key] });
  };

  return (
    <section className="workflow-detail-section">
      <div className="workflow-detail-section-header">
        <div>
          <h3 className="workflow-detail-label">GitHub actions</h3>
          <p className="settings-muted text-sm workflow-github-actions-description">
            GitHub actions the agent may call during the workflow run.
          </p>
        </div>
      </div>
      <div className="workflow-detail-card workflow-tools-card">
        {GITHUB_ACTION_ROWS.map((row) => (
          <div key={row.key} className="workflow-tool-row">
            <span>{row.label}</span>
            <SettingsToggle
              label={row.label}
              checked={tools[row.key]}
              onChange={() => toggle(row.key)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function WorkflowTeamsSection({
  tools,
  triggers,
  onChange,
}: WorkflowGithubActionsSectionProps) {
  const teamsStatusQuery = useTeamsStatusQuery();
  const teamsConnected = teamsStatusQuery.data?.connected ?? false;
  const showTeams =
    teamsConnected && (hasTeamsMentionTrigger(triggers) || hasScheduleTrigger(triggers));
  if (!showTeams) return null;

  return (
    <section className="workflow-detail-section">
      <div className="workflow-detail-section-header">
        <div>
          <h3 className="workflow-detail-label">Microsoft Teams</h3>
          <p className="settings-muted text-sm workflow-github-actions-description">
            Teams actions the agent may call during the workflow run.
          </p>
        </div>
      </div>
      <div className="workflow-detail-card workflow-tools-card">
        <div className="workflow-tool-row">
          <span>Post to Teams channel</span>
          <SettingsToggle
            label="Post to Teams channel"
            checked={tools.teamsNotify}
            onChange={() => onChange({ ...tools, teamsNotify: !tools.teamsNotify })}
          />
        </div>
      </div>
    </section>
  );
}

export function WorkflowDiscordSection({
  tools,
  triggers,
  onChange,
}: WorkflowGithubActionsSectionProps) {
  const discordStatusQuery = useDiscordStatusQuery();
  const discordConnected = discordStatusQuery.data?.connected ?? false;
  const showDiscord =
    discordConnected && (hasDiscordMentionTrigger(triggers) || hasScheduleTrigger(triggers));
  if (!showDiscord) return null;

  return (
    <section className="workflow-detail-section">
      <div className="workflow-detail-section-header">
        <div>
          <h3 className="workflow-detail-label settings-row-label-with-icon">
            <DiscordIcon size={16} />
            Discord
          </h3>
          <p className="settings-muted text-sm workflow-github-actions-description">
            Discord actions the agent may call during the workflow run.
          </p>
        </div>
      </div>
      <div className="workflow-detail-card workflow-tools-card">
        <div className="workflow-tool-row">
          <span>Post to Discord channel</span>
          <SettingsToggle
            label="Post to Discord channel"
            checked={Boolean(tools.discordNotify)}
            onChange={() => onChange({ ...tools, discordNotify: !tools.discordNotify })}
          />
        </div>
      </div>
    </section>
  );
}

type LinearToolKey = "linearRead" | "linearWrite" | "linearComments";

const LINEAR_TOOL_ROWS: Array<{ key: LinearToolKey; label: string }> = [
  { key: "linearRead", label: "Linear read (search, list, get)" },
  { key: "linearWrite", label: "Linear write (create, update, assign, link)" },
  { key: "linearComments", label: "Linear comments" },
];

export function WorkflowLinearSection({
  tools,
  triggers,
  onChange,
}: WorkflowGithubActionsSectionProps) {
  const linearStatusQuery = useLinearStatusQuery();
  const linearConnected = linearStatusQuery.data?.connected ?? false;
  const showLinear =
    linearConnected && (hasLinearTrigger(triggers) || hasScheduleTrigger(triggers));
  if (!showLinear) return null;

  const toggle = (key: LinearToolKey) => {
    onChange({ ...tools, [key]: !tools[key] });
  };

  return (
    <section className="workflow-detail-section">
      <div className="workflow-detail-section-header">
        <div>
          <h3 className="workflow-detail-label">Linear</h3>
          <p className="settings-muted text-sm workflow-github-actions-description">
            Linear tools the agent may call during the workflow run.
          </p>
        </div>
      </div>
      <div className="workflow-detail-card workflow-tools-card">
        {LINEAR_TOOL_ROWS.map((row) => (
          <div key={row.key} className="workflow-tool-row">
            <span>{row.label}</span>
            <SettingsToggle
              label={row.label}
              checked={Boolean(tools[row.key])}
              onChange={() => toggle(row.key)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
