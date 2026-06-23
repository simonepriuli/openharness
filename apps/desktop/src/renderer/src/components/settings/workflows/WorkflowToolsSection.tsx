import type { WorkflowTools, WorkflowTrigger } from "../../../../../preload/api";
import { DiscordIcon } from "../../icons/DiscordIcon";
import { SettingsToggle } from "../SettingsToggle";
import {
  hasDiscordMentionTrigger,
  hasGitPrTrigger,
  hasScheduleTrigger,
  hasTeamsMentionTrigger,
} from "./workflow-trigger-utils";

type WorkflowGithubActionsSectionProps = {
  tools: WorkflowTools;
  triggers: WorkflowTrigger[];
  onChange: (tools: WorkflowTools) => void;
};

type GithubActionKey = "prComment" | "prApprove" | "prPush";

const GITHUB_ACTION_ROWS: Array<{ key: GithubActionKey; label: string }> = [
  { key: "prComment", label: "Comment on Pull Request" },
  { key: "prApprove", label: "Approve Pull Request" },
  { key: "prPush", label: "Push commits to PR branch" },
];

export function WorkflowGithubActionsSection({
  tools,
  triggers,
  onChange,
}: WorkflowGithubActionsSectionProps) {
  if (!hasGitPrTrigger(triggers)) return null;

  const toggle = (key: GithubActionKey) => {
    onChange({ ...tools, [key]: !tools[key] });
  };

  return (
    <section className="workflow-detail-section">
      <div className="workflow-detail-section-header">
        <div>
          <h3 className="workflow-detail-label">GitHub actions</h3>
          <p className="settings-muted text-sm workflow-github-actions-description">
            Actions OpenHarness may take on GitHub after the agent finishes.
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
  const showTeams = hasTeamsMentionTrigger(triggers) || hasScheduleTrigger(triggers);
  if (!showTeams) return null;

  return (
    <section className="workflow-detail-section">
      <div className="workflow-detail-section-header">
        <div>
          <h3 className="workflow-detail-label">Microsoft Teams</h3>
          <p className="settings-muted text-sm workflow-github-actions-description">
            Post workflow results to the Teams channel mapped to this repository in Settings.
          </p>
        </div>
      </div>
      <div className="workflow-detail-card workflow-tools-card">
        <div className="workflow-tool-row">
          <span>Notify Teams on completion</span>
          <SettingsToggle
            label="Notify Teams on completion"
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
  const showDiscord = hasDiscordMentionTrigger(triggers) || hasScheduleTrigger(triggers);
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
            Post workflow results to the Discord channel mapped to this repository in Settings.
          </p>
        </div>
      </div>
      <div className="workflow-detail-card workflow-tools-card">
        <div className="workflow-tool-row">
          <span>Notify Discord on completion</span>
          <SettingsToggle
            label="Notify Discord on completion"
            checked={Boolean(tools.discordNotify)}
            onChange={() => onChange({ ...tools, discordNotify: !tools.discordNotify })}
          />
        </div>
      </div>
    </section>
  );
}
