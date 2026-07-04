export const linearAgentSessionStatuses = ["active", "complete", "error"] as const;
export type LinearAgentSessionStatus = (typeof linearAgentSessionStatuses)[number];

export const linearAgentRunStatuses = ["pending", "claimed", "running", "done", "failed"] as const;
export type LinearAgentRunStatus = (typeof linearAgentRunStatuses)[number];

export const linearAgentTriggers = ["delegated", "mentioned", "prompted"] as const;
export type LinearAgentTrigger = (typeof linearAgentTriggers)[number];
