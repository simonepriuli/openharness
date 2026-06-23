import type { Database } from "@openharness/db";
import type { SourceControlProvider } from "@openharness/db/schema";
import {
  getPrIterationCount,
  insertWorkflowRun,
  listConnectionsForProviderRepo,
  listConnectionsForRepo,
  listEnabledWorkflowsForConnection,
} from "../github/workflow-db.js";
import {
  workflowBranchMatches,
  workflowTriggerMatches,
} from "../github/workflow-trigger-match.js";
import type { WorkflowTriggerEvent } from "../github/workflow-types.js";
import { MAX_WORKFLOW_ITERATIONS } from "../github/workflow-constants.js";
import { getSourceControlProvider } from "./registry.js";
import type { NormalizedWebhookEvent } from "./types.js";

function extractBaseRef(payload: Record<string, unknown>): string | undefined {
  const pr = payload.pull_request as { base?: { ref?: string }; baseRef?: string } | undefined;
  if (pr?.base?.ref) return pr.base.ref;
  if (pr?.baseRef) return pr.baseRef;

  const resource = payload.resource as {
    pullRequest?: { targetRefName?: string };
  } | undefined;
  return resource?.pullRequest?.targetRefName?.replace(/^refs\/heads\//, "");
}

async function resolveConnections(
  db: Database,
  provider: SourceControlProvider,
  event: NormalizedWebhookEvent,
) {
  if (provider === "azure_devops") {
    return listConnectionsForProviderRepo(db, provider, event.namespace, event.repoName);
  }

  if (!event.connectionExternalId) return [];
  return listConnectionsForRepo(
    db,
    event.connectionExternalId,
    event.namespace,
    event.repoName,
  );
}

export async function handleNormalizedWebhookEvent(
  db: Database,
  provider: SourceControlProvider,
  event: NormalizedWebhookEvent,
): Promise<void> {
  const adapter = getSourceControlProvider(provider);
  const connections = await resolveConnections(db, provider, event);
  const baseRef = extractBaseRef(event.payload);

  for (const connection of connections) {
    if (connection.provider !== provider) continue;

    const identity = await adapter.getAutomationIdentity(connection.organizationId);
    const normalized =
      adapter.normalizeWorkflowTriggerInput(event) ??
      ({
        eventName: event.event,
        action: event.event,
        triggerEvents: [event.event as WorkflowTriggerEvent],
        prBaseRef: baseRef,
      } as const);

    const enrichedPayload = await adapter.enrichRunPayload(connection.organizationId, event);

    const workflows = await listEnabledWorkflowsForConnection(db, connection.id);
    for (const workflowRecord of workflows) {
      if (!workflowBranchMatches(workflowRecord.targetBranch, baseRef)) continue;

      const matchedTrigger = workflowRecord.triggers.find(
        (trigger) =>
          trigger.kind === "git_pr" &&
          trigger.event === event.event &&
          workflowTriggerMatches(trigger, normalized, identity),
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
          ...enrichedPayload,
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
