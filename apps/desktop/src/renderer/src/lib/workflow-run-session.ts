export function buildWorkflowRunSessionKey(runId: string): string {
  return `workflow-run::${runId}`;
}

export function parseWorkflowRunSessionKey(sessionKey: string): string | null {
  const prefix = "workflow-run::";
  if (!sessionKey.startsWith(prefix)) return null;
  const runId = sessionKey.slice(prefix.length);
  return runId.length > 0 ? runId : null;
}
