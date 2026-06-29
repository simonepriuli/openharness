import { eq, type Database } from "@openharness/db";
import { organization, workflow } from "@openharness/db/schema";
import {
  isWorkflowExecutionTarget,
  type WorkflowExecutionTarget,
  type WorkflowResolvedExecutor,
} from "@openharness/shared/workflow-execution";
import { env } from "../env.js";

export function isCloudInfraConfigured(): boolean {
  return Boolean(env.cloudWorkerSecret());
}

export function resolveExecutor(input: {
  executionTarget: WorkflowExecutionTarget;
  localOnly: boolean;
  cloudWorkersEnabled: boolean;
}): WorkflowResolvedExecutor {
  if (input.localOnly) return "local";
  if (input.executionTarget === "local") return "local";

  const cloudAvailable = input.cloudWorkersEnabled && isCloudInfraConfigured();
  if (input.executionTarget === "cloud") {
    return cloudAvailable ? "cloud" : "local";
  }

  return cloudAvailable ? "cloud" : "local";
}

export async function resolveExecutorForWorkflowRun(
  db: Database,
  organizationId: string,
  workflowId: string | null,
): Promise<WorkflowResolvedExecutor> {
  if (!workflowId) return "local";

  const workflowRows = await db
    .select({
      localOnly: workflow.localOnly,
      executionTarget: workflow.executionTarget,
    })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1);

  const workflowRow = workflowRows[0];
  if (!workflowRow) return "local";

  const orgRows = await db
    .select({ cloudWorkersEnabled: organization.cloudWorkersEnabled })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  const executionTarget = isWorkflowExecutionTarget(workflowRow.executionTarget)
    ? workflowRow.executionTarget
    : "auto";

  return resolveExecutor({
    executionTarget,
    localOnly: workflowRow.localOnly,
    cloudWorkersEnabled: orgRows[0]?.cloudWorkersEnabled ?? false,
  });
}
