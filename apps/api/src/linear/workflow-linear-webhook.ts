import { and, eq, sql, type Database } from "@openharness/db";
import { projectSourceControlConnection, type SourceControlProvider } from "@openharness/db/schema";
import {
  insertWorkflowRun,
  listEnabledWorkflowsForConnection,
} from "../github/workflow-db.js";
import type {
  LinearTriggerEvent,
  WorkflowLinearTrigger,
} from "../github/workflow-types.js";
import { workflowLinearTriggerMatches } from "../github/workflow-trigger-match.js";
import {
  findLinearMappingByProjectId,
  getLinearInstallationByWorkspaceId,
} from "./linear-db.js";
import { extractProjectId, issueIdFromPayload } from "./linear-webhook-payload.js";
import {
  extractLinearWebhookActor,
  isOpenHarnessAuthoredLinearComment,
  linearCommentAuthorUserId,
} from "./linear-webhook-comment-filter.js";
import { fetchLinearViewer } from "./linear-oauth.js";
import { getValidLinearAccessToken } from "./linear-token.js";

const APP_ACTOR_USER_ID_CACHE_TTL_MS = 60 * 60 * 1000;
const appActorUserIdByWorkspace = new Map<string, { userId: string; expiresAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 60;
const webhookRateByWorkspace = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(workspaceId: string): boolean {
  const now = Date.now();
  const entry = webhookRateByWorkspace.get(workspaceId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    webhookRateByWorkspace.set(workspaceId, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function normalizeLinearEvent(payload: Record<string, unknown>): LinearTriggerEvent | null {
  const type = typeof payload.type === "string" ? payload.type : "";
  const action = typeof payload.action === "string" ? payload.action : "";

  if (type === "Issue" && action === "create") return "linear_issue_created";
  if (type === "Issue" && action === "update") return "linear_issue_updated";
  if (type === "Comment" && action === "create") return "linear_comment_created";
  return null;
}

async function resolveProjectIdFromIssue(
  accessToken: string,
  issueId: string,
): Promise<string | null> {
  const { getLinearIssue } = await import("./linear-client.js");
  const issue = await getLinearIssue(accessToken, issueId);
  return issue?.project?.id ?? null;
}

function workflowHasLinearTrigger(
  triggers: unknown,
  event: LinearTriggerEvent,
): WorkflowLinearTrigger[] {
  if (!Array.isArray(triggers)) return [];
  return triggers.filter((trigger) => {
    if (!trigger || typeof trigger !== "object") return false;
    const row = trigger as WorkflowLinearTrigger;
    return row.kind === "linear" && row.event === event;
  });
}

async function resolveLinearAppActorUserId(
  workspaceId: string,
  accessToken: string,
): Promise<string | null> {
  const cached = appActorUserIdByWorkspace.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId;
  }

  try {
    const viewer = await fetchLinearViewer(accessToken);
    appActorUserIdByWorkspace.set(workspaceId, {
      userId: viewer.id,
      expiresAt: Date.now() + APP_ACTOR_USER_ID_CACHE_TTL_MS,
    });
    return viewer.id;
  } catch (err) {
    console.warn("[linear-webhook] failed to resolve app actor user id", workspaceId, err);
    return null;
  }
}

async function shouldIgnoreSelfAuthoredLinearComment(
  workspaceId: string,
  accessToken: string,
  payload: Record<string, unknown>,
  dataRow: Record<string, unknown> | null,
): Promise<boolean> {
  const actor = extractLinearWebhookActor(payload);
  const commentAuthorUserId = linearCommentAuthorUserId(dataRow);
  const appActorUserId = await resolveLinearAppActorUserId(workspaceId, accessToken);
  return isOpenHarnessAuthoredLinearComment({
    actor,
    commentAuthorUserId,
    appActorUserId,
  });
}

export async function handleLinearWebhookEvent(
  db: Database,
  options: {
    payload: Record<string, unknown>;
    deliveryId: string | null;
  },
): Promise<void> {
  const event = normalizeLinearEvent(options.payload);
  if (!event) return;

  const workspaceId =
    typeof options.payload.organizationId === "string"
      ? options.payload.organizationId
      : null;
  if (!workspaceId) return;

  if (isRateLimited(workspaceId)) {
    console.warn("[linear-webhook] rate limited workspace", workspaceId);
    return;
  }

  const installation = await getLinearInstallationByWorkspaceId(db, workspaceId);
  if (!installation) {
    console.warn("[linear-webhook] no installation for workspace", workspaceId);
    return;
  }

  const accessToken = await getValidLinearAccessToken(db, installation.organizationId);
  if (!accessToken) {
    console.warn("[linear-webhook] no valid access token for org", installation.organizationId);
    return;
  }

  let projectId = extractProjectId(options.payload);
  const data = options.payload.data;
  const dataRow = data && typeof data === "object" ? (data as Record<string, unknown>) : null;

  if (event === "linear_comment_created") {
    const ignoreSelfComment = await shouldIgnoreSelfAuthoredLinearComment(
      workspaceId,
      accessToken,
      options.payload,
      dataRow,
    );
    if (ignoreSelfComment) {
      console.info("[linear-webhook] ignoring self-authored comment", {
        commentId: dataRow?.id,
        issueId: dataRow?.issueId,
      });
      return;
    }
  }

  if (!projectId) {
    const resourceType =
      typeof options.payload.type === "string" ? options.payload.type : undefined;
    const issueId = issueIdFromPayload(dataRow, { resourceType });
    if (issueId) {
      projectId = await resolveProjectIdFromIssue(accessToken, issueId);
    }
  }

  if (!projectId) {
    const resourceType =
      typeof options.payload.type === "string" ? options.payload.type : undefined;
    console.warn("[linear-webhook] no project id for event", event, {
      issueId: issueIdFromPayload(dataRow, { resourceType }),
      teamId: typeof dataRow?.teamId === "string" ? dataRow.teamId : null,
    });
    return;
  }

  const mapping = await findLinearMappingByProjectId(
    db,
    installation.organizationId,
    projectId,
  );
  if (!mapping) {
    console.warn("[linear-webhook] no project mapping for", projectId);
    return;
  }

  const connectionRows = await db
    .select()
    .from(projectSourceControlConnection)
    .where(
      and(
        eq(projectSourceControlConnection.organizationId, mapping.organizationId),
        eq(projectSourceControlConnection.provider, mapping.provider as SourceControlProvider),
        sql`lower(${projectSourceControlConnection.namespace}) = ${mapping.namespace.toLowerCase()}`,
        sql`lower(${projectSourceControlConnection.name}) = ${mapping.repoName.toLowerCase()}`,
      ),
    );

  const deliveryBase =
    options.deliveryId ??
    `${event}:${projectId}:${dataRow?.id ?? Date.now()}`;

  for (const connection of connectionRows) {
    const workflows = await listEnabledWorkflowsForConnection(db, connection.id);

    for (const workflowRecord of workflows) {
      const linearTriggers = workflowHasLinearTrigger(workflowRecord.triggers, event);
      const matching = linearTriggers.filter((trigger) =>
        workflowLinearTriggerMatches(trigger, {
          event,
          projectId,
          teamId:
            dataRow?.teamId && typeof dataRow.teamId === "string"
              ? dataRow.teamId
              : undefined,
          labelIds: undefined,
        }),
      );

      for (const trigger of matching) {
        const deliveryId = `linear:${deliveryBase}:${workflowRecord.id}:${trigger.id}`;
        await insertWorkflowRun(db, {
          organizationId: mapping.organizationId,
          userId: mapping.userId,
          projectSourceControlConnectionId: connection.id,
          connectionId: connection.connectionId,
          provider: connection.provider,
          namespace: connection.namespace,
          repoName: connection.name,
          prNumber: 0,
          workflowId: workflowRecord.id,
          workflowType: null,
          event,
          deliveryId,
          iteration: 1,
          payload: {
            branch: workflowRecord.targetBranch,
            linear: {
              event,
              projectId,
              projectName: mapping.projectName,
              issueId:
                event === "linear_comment_created"
                  ? (dataRow?.issueId as string | undefined)
                  : (dataRow?.id as string | undefined),
              issueIdentifier:
                typeof dataRow?.identifier === "string" ? dataRow.identifier : undefined,
              issueTitle: typeof dataRow?.title === "string" ? dataRow.title : undefined,
              issueDescription:
                typeof dataRow?.description === "string" ? dataRow.description : undefined,
              commentBody:
                event === "linear_comment_created" && typeof dataRow?.body === "string"
                  ? dataRow.body
                  : undefined,
              webhookPayload: options.payload,
            },
            workflow: {
              id: workflowRecord.id,
              name: workflowRecord.name,
              model: workflowRecord.model,
              instructions: workflowRecord.instructions,
              targetBranch: workflowRecord.targetBranch,
              tools: workflowRecord.tools,
              triggerEvent: event,
            },
          },
        });
      }
    }
  }
}
