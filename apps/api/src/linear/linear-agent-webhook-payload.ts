import type { LinearAgentTrigger } from "@openharness/db/schema";

export function isLinearAgentSessionEvent(payload: Record<string, unknown>): boolean {
  return payload.type === "AgentSessionEvent";
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function parseLinearAgentSessionId(payload: Record<string, unknown>): string | null {
  const agentSession = readRecord(payload.agentSession);
  const id = agentSession?.id;
  return typeof id === "string" ? id : null;
}

export function parseLinearAgentAction(payload: Record<string, unknown>): string | null {
  return typeof payload.action === "string" ? payload.action : null;
}

export function parseLinearAgentPromptContext(payload: Record<string, unknown>): string | null {
  return typeof payload.promptContext === "string" ? payload.promptContext : null;
}

export function parseLinearAgentUserPrompt(payload: Record<string, unknown>): string | null {
  const agentActivity = readRecord(payload.agentActivity);
  const body = agentActivity?.body;
  return typeof body === "string" ? body : null;
}

export function parseLinearAgentIssueFromPayload(payload: Record<string, unknown>): {
  issueId: string | null;
  issueIdentifier: string | null;
  projectId: string | null;
  issueTitle: string | null;
} {
  const agentSession = readRecord(payload.agentSession);
  const issue = readRecord(agentSession?.issue);
  if (!issue) {
    return { issueId: null, issueIdentifier: null, projectId: null, issueTitle: null };
  }

  const project = readRecord(issue.project);
  return {
    issueId: typeof issue.id === "string" ? issue.id : null,
    issueIdentifier: typeof issue.identifier === "string" ? issue.identifier : null,
    projectId: typeof project?.id === "string" ? project.id : null,
    issueTitle: typeof issue.title === "string" ? issue.title : null,
  };
}

export function parseLinearAgentTrigger(payload: Record<string, unknown>): LinearAgentTrigger | null {
  const action = parseLinearAgentAction(payload);
  if (action === "prompted") return "prompted";
  if (action !== "created") return null;

  const agentSession = readRecord(payload.agentSession);
  const issue = readRecord(agentSession?.issue);
  const delegate = readRecord(issue?.delegate);
  if (delegate?.id) return "delegated";
  return "mentioned";
}
