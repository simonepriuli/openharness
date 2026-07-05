import type { Database } from "@openharness/db";
import {
  assertLinearAgentCloudReady,
  emitLinearAgentRunMilestone,
  emitLinearAgentSessionError,
  emitLinearAgentSessionThought,
  setLinearAgentSessionExternalUrl,
} from "./linear-agent-activities.js";
import {
  getLinearAgentConfigForMapping,
  insertLinearAgentRun,
  orgCloudWorkersAvailable,
  resolveLinearAgentConnectionIds,
  upsertLinearAgentSession,
  DEFAULT_AGENT_TOOLS,
} from "./linear-agent-db.js";
import { getLinearIssue } from "./linear-client.js";
import { findLinearMappingByProjectId, getLinearInstallationByWorkspaceId } from "./linear-db.js";
import {
  isLinearAgentSessionEvent,
  parseLinearAgentIssueFromPayload,
  parseLinearAgentPromptContext,
  parseLinearAgentSessionId,
  parseLinearAgentTrigger,
  parseLinearAgentUserPrompt,
} from "./linear-agent-webhook-payload.js";
import { getValidLinearAccessToken } from "./linear-token.js";
import { resolveProjectIdFromIssue } from "./workflow-linear-agent-resolve.js";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 60;
const agentWebhookRateByWorkspace = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(workspaceId: string): boolean {
  const now = Date.now();
  const entry = agentWebhookRateByWorkspace.get(workspaceId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    agentWebhookRateByWorkspace.set(workspaceId, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

async function postAgentError(
  db: Database,
  organizationId: string,
  linearAgentSessionId: string,
  message: string,
): Promise<void> {
  await emitLinearAgentSessionThought(db, organizationId, linearAgentSessionId, message);
  await emitLinearAgentSessionError(db, organizationId, linearAgentSessionId, message);
}

export async function handleLinearAgentWebhookEvent(
  db: Database,
  options: {
    payload: Record<string, unknown>;
    deliveryId: string | null;
  },
): Promise<void> {
  if (!isLinearAgentSessionEvent(options.payload)) return;

  const workspaceId =
    typeof options.payload.organizationId === "string" ? options.payload.organizationId : null;
  if (!workspaceId) return;

  if (isRateLimited(workspaceId)) {
    console.warn("[linear-agent-webhook] rate limited workspace", workspaceId);
    return;
  }

  const linearAgentSessionId = parseLinearAgentSessionId(options.payload);
  const trigger = parseLinearAgentTrigger(options.payload);
  if (!linearAgentSessionId || !trigger) {
    console.warn("[linear-agent-webhook] missing session id or unsupported action", options.payload);
    return;
  }

  const installation = await getLinearInstallationByWorkspaceId(db, workspaceId);
  if (!installation) {
    console.warn("[linear-agent-webhook] no installation for workspace", workspaceId);
    return;
  }

  const accessToken = await getValidLinearAccessToken(db, installation.organizationId);
  if (!accessToken) {
    console.warn(
      "[linear-agent-webhook] no valid access token for org",
      installation.organizationId,
    );
    return;
  }

  let issueFields = parseLinearAgentIssueFromPayload(options.payload);
  if (!issueFields.projectId && issueFields.issueId) {
    const projectId = await resolveProjectIdFromIssue(accessToken, issueFields.issueId);
    issueFields = { ...issueFields, projectId };
  }

  if (!issueFields.projectId) {
    await postAgentError(
      db,
      installation.organizationId,
      linearAgentSessionId,
      "OpenHarness could not resolve the Linear project for this issue. Map the project to a repository in OpenHarness Integrations.",
    );
    return;
  }

  const cloudReady = await assertLinearAgentCloudReady(db, installation.organizationId);
  if (!cloudReady.ok) {
    await postAgentError(db, installation.organizationId, linearAgentSessionId, cloudReady.message);
    return;
  }

  const mapping = await findLinearMappingByProjectId(
    db,
    installation.organizationId,
    issueFields.projectId,
  );

  if (!mapping) {
    await postAgentError(
      db,
      installation.organizationId,
      linearAgentSessionId,
      "OpenHarness agent is not configured for this Linear project. Ask an admin to set up a project mapping and enable the agent.",
    );
    return;
  }

  const connectionIds = await resolveLinearAgentConnectionIds(db, mapping);
  if (!connectionIds) {
    await postAgentError(
      db,
      installation.organizationId,
      linearAgentSessionId,
      `OpenHarness could not find a source control connection for ${mapping.namespace}/${mapping.repoName}. Link the repository under Organization → Source control, then retry.`,
    );
    return;
  }

  const config =
    (await getLinearAgentConfigForMapping(db, installation.organizationId, mapping.id)) ?? {
      enabled: false,
      model: "",
      instructions: "",
      targetBranch: "main",
      tools: DEFAULT_AGENT_TOOLS,
    };

  if (!config.enabled) {
    await postAgentError(
      db,
      installation.organizationId,
      linearAgentSessionId,
      "OpenHarness agent is disabled for this Linear project. Ask an admin to enable it under Organization → Linear Agents.",
    );
    return;
  }

  await emitLinearAgentSessionThought(
    db,
    installation.organizationId,
    linearAgentSessionId,
    "Starting OpenHarness agent…",
  );

  const session = await upsertLinearAgentSession(db, {
    organizationId: installation.organizationId,
    mappingId: mapping.id,
    linearAgentSessionId,
    linearIssueId: issueFields.issueId,
    issueIdentifier: issueFields.issueIdentifier,
  });

  const promptContext = parseLinearAgentPromptContext(options.payload);
  const userPrompt = parseLinearAgentUserPrompt(options.payload);

  let issueDetails = null;
  if (issueFields.issueId) {
    try {
      issueDetails = await getLinearIssue(accessToken, issueFields.issueId);
    } catch {
      // Optional enrichment only.
    }
  }

  const deliveryBase =
    options.deliveryId ?? `${trigger}:${linearAgentSessionId}:${Date.now()}`;
  const deliveryId = `linear-agent:${deliveryBase}`;

  const agentConfig = await getLinearAgentConfigForMapping(
    db,
    installation.organizationId,
    mapping.id,
  );

  const result = await insertLinearAgentRun(db, {
    organizationId: installation.organizationId,
    userId: mapping.userId,
    sessionId: session.id,
    mappingId: mapping.id,
    provider: mapping.provider,
    namespace: mapping.namespace,
    repoName: mapping.repoName,
    projectSourceControlConnectionId: connectionIds.projectSourceControlConnectionId,
    connectionId: connectionIds.connectionId,
    trigger,
    deliveryId,
    payload: {
      linearAgentSessionId,
      promptContext,
      userPrompt,
      trigger,
      targetBranch: agentConfig?.targetBranch ?? config.targetBranch,
      agentConfig: {
        model: agentConfig?.model ?? config.model,
        instructions: agentConfig?.instructions ?? config.instructions,
        tools: agentConfig?.tools ?? config.tools,
        targetBranch: agentConfig?.targetBranch ?? config.targetBranch,
      },
      issue: {
        id: issueFields.issueId,
        identifier: issueFields.issueIdentifier,
        title: issueDetails?.title ?? issueFields.issueTitle,
        description: issueDetails?.description ?? null,
        url: issueDetails?.url ?? null,
      },
      mapping: {
        projectId: mapping.projectId,
        projectName: mapping.projectName,
      },
    },
  });

  if (!result.inserted || !result.id) {
    console.info("[linear-agent-webhook] duplicate delivery", deliveryId);
    return;
  }

  await setLinearAgentSessionExternalUrl(
    db,
    installation.organizationId,
    linearAgentSessionId,
    result.id,
  );
  await emitLinearAgentRunMilestone(db, installation.organizationId, result.id, "queued");
}

export async function orgHasCloudWorkersForAgent(
  db: Database,
  organizationId: string,
): Promise<boolean> {
  return orgCloudWorkersAvailable(db, organizationId);
}
