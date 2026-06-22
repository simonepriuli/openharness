import { randomUUID } from "node:crypto";
import { appStore } from "./store.js";

export function getWorkflowRunnerInstanceId(): string {
  const existing = appStore.get("workflowRunnerInstanceId");
  if (existing) return existing;
  const id = `${process.env.USER ?? "desktop"}-${randomUUID()}`;
  appStore.set("workflowRunnerInstanceId", id);
  return id;
}
