import { randomUUID } from "node:crypto";
import type { Database } from "@openharness/db";
import type { SourceControlProvider } from "@openharness/db/schema";
import { Result } from "better-result";
import { WorkflowValidationError } from "../errors.js";
import { manualDeliveryId, validateScheduleTrigger } from "./workflow-cron.js";
import { getOrgWorkflowWithConnection, insertWorkflowRun } from "./workflow-db.js";
import {
  isScheduleOnlyWorkflow,
  type WorkflowRecord,
  type WorkflowScheduleTrigger,
} from "./workflow-types.js";

export function validateManualWorkflowRun(
  workflow: WorkflowRecord,
): Result<{ trigger: WorkflowScheduleTrigger }, WorkflowValidationError> {
  if (!isScheduleOnlyWorkflow(workflow.triggers)) {
    return Result.err(
      new WorkflowValidationError({ message: "Workflow is not schedule-only", status: 400 }),
    );
  }

  if (!workflow.targetBranch.trim()) {
    return Result.err(
      new WorkflowValidationError({ message: "targetBranch is required", status: 400 }),
    );
  }

  const trigger = workflow.triggers.find(
    (row): row is WorkflowScheduleTrigger => row.kind === "schedule",
  );
  if (!trigger) {
    return Result.err(
      new WorkflowValidationError({ message: "No schedule trigger found", status: 400 }),
    );
  }

  const cronResult = validateScheduleTrigger(trigger);
  if (Result.isError(cronResult)) return cronResult;

  return Result.ok({ trigger });
}

export async function enqueueManualWorkflowRun(
  db: Database,
  organizationId: string,
  workflowId: string,
  viewerUserId?: string,
): Promise<Result<{ runId: string }, WorkflowValidationError>> {
  const workflow = await getOrgWorkflowWithConnection(
    db,
    organizationId,
    workflowId,
    viewerUserId,
  );
  if (!workflow) {
    return Result.err(new WorkflowValidationError({ message: "Workflow not found", status: 404 }));
  }

  const validation = validateManualWorkflowRun(workflow);
  if (Result.isError(validation)) return validation;

  const runId = randomUUID();
  const now = new Date();
  const result = await insertWorkflowRun(db, {
    organizationId,
    userId: workflow.userId,
    workflowId: workflow.id,
    workflowType: null,
    projectSourceControlConnectionId: workflow.connectionId,
    connectionId: workflow.sourceConnectionId,
    provider: workflow.provider as SourceControlProvider,
    namespace: workflow.owner,
    repoName: workflow.repo,
    prNumber: 0,
    event: "manual",
    deliveryId: manualDeliveryId(workflow.id, runId),
    iteration: 1,
    payload: {
      branch: workflow.targetBranch,
      triggerId: validation.value.trigger.id,
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
    return Result.err(
      new WorkflowValidationError({ message: "Failed to enqueue workflow run", status: 500 }),
    );
  }

  return Result.ok({ runId: result.id });
}
