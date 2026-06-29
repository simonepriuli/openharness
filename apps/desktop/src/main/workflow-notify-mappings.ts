export const WORKFLOW_NOTIFY_TOOL_NAMES = [
  "post_discord_message",
  "post_teams_message",
] as const;

export type WorkflowNotifyToolName = (typeof WORKFLOW_NOTIFY_TOOL_NAMES)[number];

export type WorkflowNotifyToolToggles = {
  teamsNotify: boolean;
  discordNotify?: boolean;
};

export function enabledNotifyToolsFromWorkflowToggles(
  tools: WorkflowNotifyToolToggles,
): WorkflowNotifyToolName[] {
  const enabled: WorkflowNotifyToolName[] = [];
  if (tools.discordNotify) enabled.push("post_discord_message");
  if (tools.teamsNotify) enabled.push("post_teams_message");
  return enabled;
}
