import { randomUUID } from "node:crypto";
import type { Database } from "@openharness/db";
import { manualDeliveryId, validateScheduleTrigger } from "./workflow-cron.js";
import { getUserWorkflowWithConnection, insertWorkflowRun } from "./workflow-db.js";
import {
  isScheduleOnlyWorkflow,
  type WorkflowRecord,
  type WorkflowScheduleTrigger,
} from "./workflow-types.js";

export type ManualWorkflowRunValidation =
  | { ok: true; trigger: WorkflowScheduleTrigger }
  | { ok: false; error: string };

export function validateManualWorkflowRun(workflow: WorkflowRecord): ManualWorkflowRunValidation {
  if (!isScheduleOnlyWorkflow(workflow.triggers)) {
    return { ok: false, error: "Workflow is not schedule-only" };
  }

  if (!workflow.targetBranch.trim()) {
    return { ok: false, error: "targetBranch is required" };
  }

  const trigger = workflow.triggers.find(
    (row): row is WorkflowScheduleTrigger => row.kind === "schedule",
  );
  if (!trigger) {
    return { ok: false, error: "No schedule trigger found" };
  }

  const cronResult = validateScheduleTrigger(trigger);
  if (!cronResult.ok) {
    return { ok: false, error: cronResult.error };
  }

  return { ok: true, trigger };
}

export async function enqueueManualWorkflowRun(
  db: Database,
  userId: string,
  workflowId: string,
): Promise<
  { ok: true; runId: string } | { ok: false; error: string; status: 400 | 404 | 500 }
> {
  const workflow = await getUserWorkflowWithConnection(db, userId, workflowId);
  if (!workflow) {
    return { ok: false, error: "Workflow not found", status: 404 };
  }

  const validation = validateManualWorkflowRun(workflow);
  if (!validation.ok) {
    return { ok: false, error: validation.error, status: 400 };
  }

  const runId = randomUUID();
  const now = new Date();
  const result = await insertWorkflowRun(db, {
    userId,
    workflowId: workflow.id,
    workflowType: null,
    projectGithubConnectionId: workflow.connectionId,
    projectPath: workflow.projectPath,
    installationId: workflow.installationId,
    githubOwner: workflow.owner,
    githubRepo: workflow.repo,
    prNumber: 0,
    event: "manual",
    deliveryId: manualDeliveryId(workflow.id, runId),
    iteration: 1,
    payload: {
      branch: workflow.targetBranch,
      triggerId: validation.trigger.id,
      scheduledAt: now.toISOString(),
      workflow: {
        id: workflow.id,
        name: workflow.name,
        model: workflow.model,
        instructions: workflow.instructions,
        tools: workflow.tools,
        triggerLabel: "Manual",
      },
    },
  });

  if (!result.inserted || !result.id) {
    return { ok: false, error: "Failed to enqueue workflow run", status: 500 };
  }

  return { ok: true, runId: result.id };
}
