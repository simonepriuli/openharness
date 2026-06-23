import type { Database } from "@openharness/db";
import type { SourceControlProvider } from "@openharness/db/schema";
import { env } from "../env.js";
import { githubAppBotLogin, MAX_WORKFLOW_ITERATIONS } from "../github/workflow-constants.js";
import {
  getPrIterationCount,
  insertWorkflowRun,
  listConnectionsForRepo,
  listEnabledWorkflowsForConnection,
} from "../github/workflow-db.js";
import {
  workflowBranchMatches,
  workflowTriggerMatches,
  type NormalizedWorkflowEvent,
} from "../github/workflow-trigger-match.js";
import type { WorkflowTriggerEvent } from "../github/workflow-types.js";
import type { NormalizedWebhookEvent } from "./types.js";

function toNormalizedWorkflowEvent(
  event: NormalizedWebhookEvent,
): NormalizedWorkflowEvent {
  const triggerEvent = event.event as WorkflowTriggerEvent;
  return {
    eventName: event.event,
    action: event.event,
    triggerEvents: [triggerEvent],
    prBaseRef: extractBaseRef(event.payload),
  };
}

function extractBaseRef(payload: Record<string, unknown>): string | undefined {
  const pr = payload.pull_request as { base?: { ref?: string } } | undefined;
  if (pr?.base?.ref) return pr.base.ref;

  const resource = payload.resource as {
    pullRequest?: { targetRefName?: string };
  } | undefined;
  return resource?.pullRequest?.targetRefName?.replace(/^refs\/heads\//, "");
}

export async function handleNormalizedWebhookEvent(
  db: Database,
  provider: SourceControlProvider,
  event: NormalizedWebhookEvent,
): Promise<void> {
  const botLogin = provider === "github" ? githubAppBotLogin(env.githubAppSlug()) : "openharness";
  const normalized = toNormalizedWorkflowEvent(event);

  const connections = await listConnectionsForRepo(
    db,
    event.connectionExternalId,
    event.namespace,
    event.repoName,
  );

  const baseRef = extractBaseRef(event.payload);

  for (const connection of connections) {
    if (connection.provider !== provider) continue;

    const workflows = await listEnabledWorkflowsForConnection(db, connection.id);
    for (const workflowRecord of workflows) {
      if (!workflowBranchMatches(workflowRecord.targetBranch, baseRef)) continue;

      const matchedTrigger = workflowRecord.triggers.find(
        (trigger) =>
          trigger.kind === "git_pr" &&
          trigger.event === event.event &&
          workflowTriggerMatches(trigger, normalized, botLogin),
      );
      if (!matchedTrigger || matchedTrigger.kind !== "git_pr") continue;

      const iteration =
        (await getPrIterationCount(
          db,
          event.namespace,
          event.repoName,
          event.prNumber,
          workflowRecord.id,
        )) + 1;

      if (iteration > MAX_WORKFLOW_ITERATIONS) continue;

      await insertWorkflowRun(db, {
        organizationId: connection.organizationId,
        userId: connection.userId,
        workflowId: workflowRecord.id,
        workflowType: null,
        projectSourceControlConnectionId: connection.id,
        connectionId: connection.connectionId,
        provider: connection.provider,
        namespace: event.namespace,
        repoName: event.repoName,
        prNumber: event.prNumber,
        event: matchedTrigger.event,
        deliveryId: `${event.deliveryId}:${connection.id}:${workflowRecord.id}:${matchedTrigger.id}`,
        iteration,
        payload: {
          ...event.payload,
          workflow: {
            id: workflowRecord.id,
            name: workflowRecord.name,
            model: workflowRecord.model,
            instructions: workflowRecord.instructions,
            tools: workflowRecord.tools,
            triggerEvent: matchedTrigger.event,
          },
        },
      });
    }
  }
}
