export const workflowExecutionTargets = ["local", "cloud", "auto"] as const;
export type WorkflowExecutionTarget = (typeof workflowExecutionTargets)[number];

export const workflowResolvedExecutors = ["cloud", "local"] as const;
export type WorkflowResolvedExecutor = (typeof workflowResolvedExecutors)[number];

export const workflowRunnerKinds = ["desktop", "cloud"] as const;
export type WorkflowRunnerKind = (typeof workflowRunnerKinds)[number];

export function isWorkflowExecutionTarget(value: string): value is WorkflowExecutionTarget {
  return (workflowExecutionTargets as readonly string[]).includes(value);
}

export function isWorkflowResolvedExecutor(value: string): value is WorkflowResolvedExecutor {
  return (workflowResolvedExecutors as readonly string[]).includes(value);
}

export function isWorkflowRunnerKind(value: string): value is WorkflowRunnerKind {
  return (workflowRunnerKinds as readonly string[]).includes(value);
}
