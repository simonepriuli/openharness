import type { WorkflowTemplate, WorkflowTools, WorkflowTrigger } from "../preload/api.js";

export type WorkflowIntegrationAvailability = {
  sourceControlReady: boolean;
  teamsConnected: boolean;
  discordConnected: boolean;
  linearConnected: boolean;
};

function requiresTeams(triggers: WorkflowTrigger[], tools: WorkflowTools): boolean {
  return (
    triggers.some((trigger) => trigger.kind === "teams_mention") ||
    (triggers.some((trigger) => trigger.kind === "schedule") && tools.teamsNotify)
  );
}

function requiresDiscord(triggers: WorkflowTrigger[], tools: WorkflowTools): boolean {
  return (
    triggers.some((trigger) => trigger.kind === "discord_mention") ||
    (triggers.some((trigger) => trigger.kind === "schedule") && Boolean(tools.discordNotify))
  );
}

function requiresLinear(triggers: WorkflowTrigger[], tools: WorkflowTools): boolean {
  return (
    triggers.some((trigger) => trigger.kind === "linear") ||
    Boolean(tools.linearRead || tools.linearWrite || tools.linearComments)
  );
}

function requiresSourceControl(triggers: WorkflowTrigger[], tools: WorkflowTools): boolean {
  return (
    triggers.some((trigger) => trigger.kind === "git_pr") ||
    tools.prComment ||
    tools.prApprove ||
    tools.prPush ||
    tools.prCreate
  );
}

export function isWorkflowTemplateAvailable(
  template: WorkflowTemplate,
  availability: WorkflowIntegrationAvailability,
): boolean {
  const { triggers, tools } = template;

  if (requiresTeams(triggers, tools) && !availability.teamsConnected) {
    return false;
  }
  if (requiresDiscord(triggers, tools) && !availability.discordConnected) {
    return false;
  }
  if (requiresLinear(triggers, tools) && !availability.linearConnected) {
    return false;
  }
  if (requiresSourceControl(triggers, tools) && !availability.sourceControlReady) {
    return false;
  }

  return true;
}

export function filterAvailableWorkflowTemplates(
  templates: WorkflowTemplate[],
  availability: WorkflowIntegrationAvailability,
): WorkflowTemplate[] {
  return templates.filter((template) => isWorkflowTemplateAvailable(template, availability));
}
