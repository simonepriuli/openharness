import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql, type Database } from "@openharness/db";
import {
  linearAgentConfig,
  linearAgentRun,
  linearAgentSession,
  organization,
  projectSourceControlConnection,
  type SourceControlProvider,
} from "@openharness/db/schema";
import type { WorkflowTools } from "@openharness/shared/workflow-run";
import type { LinearAgentTrigger } from "@openharness/db/schema";
import { findLinearMappingByProjectId, listLinearMappingsForOrg } from "./linear-db.js";

export type LinearAgentConfigRecord = {
  id: string;
  organizationId: string;
  mappingId: string;
  enabled: boolean;
  model: string;
  instructions: string;
  targetBranch: string;
  tools: WorkflowTools;
  createdAt: string;
  updatedAt: string;
};

export type LinearAgentConfigWithMapping = LinearAgentConfigRecord & {
  projectId: string;
  projectName: string;
  provider: string;
  namespace: string;
  repoName: string;
  projectSourceControlConnectionId: string | null;
};

export type LinearAgentSessionRecord = {
  id: string;
  organizationId: string;
  mappingId: string | null;
  linearAgentSessionId: string;
  linearIssueId: string | null;
  issueIdentifier: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type LinearAgentRunRecord = {
  id: string;
  organizationId: string;
  userId: string;
  sessionId: string;
  mappingId: string | null;
  projectSourceControlConnectionId: string | null;
  connectionId: string | null;
  provider: string;
  namespace: string;
  repoName: string;
  trigger: LinearAgentTrigger;
  deliveryId: string;
  status: string;
  claimedBy: string | null;
  runnerKind: string | null;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  resultMarkdown: string | null;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_AGENT_TOOLS: WorkflowTools = {
  prComment: false,
  prApprove: false,
  prPush: true,
  prCreate: true,
  teamsNotify: false,
  discordNotify: false,
  linearRead: true,
  linearWrite: true,
  linearComments: true,
};

function parseTools(value: unknown): WorkflowTools {
  if (!value || typeof value !== "object") return { ...DEFAULT_AGENT_TOOLS };
  const row = value as Partial<WorkflowTools>;
  return {
    ...DEFAULT_AGENT_TOOLS,
    ...row,
  };
}

function mapConfig(row: typeof linearAgentConfig.$inferSelect): LinearAgentConfigRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    mappingId: row.mappingId,
    enabled: row.enabled,
    model: row.model,
    instructions: row.instructions,
    targetBranch: row.targetBranch,
    tools: parseTools(row.tools),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapSession(row: typeof linearAgentSession.$inferSelect): LinearAgentSessionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    mappingId: row.mappingId,
    linearAgentSessionId: row.linearAgentSessionId,
    linearIssueId: row.linearIssueId,
    issueIdentifier: row.issueIdentifier,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRun(row: typeof linearAgentRun.$inferSelect): LinearAgentRunRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    sessionId: row.sessionId,
    mappingId: row.mappingId,
    projectSourceControlConnectionId: row.projectSourceControlConnectionId,
    connectionId: row.connectionId,
    provider: row.provider,
    namespace: row.namespace,
    repoName: row.repoName,
    trigger: row.trigger as LinearAgentTrigger,
    deliveryId: row.deliveryId,
    status: row.status,
    claimedBy: row.claimedBy,
    runnerKind: row.runnerKind,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    errorMessage: row.errorMessage,
    resultMarkdown: row.resultMarkdown,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listLinearAgentConfigsForOrg(
  db: Database,
  organizationId: string,
): Promise<LinearAgentConfigWithMapping[]> {
  const mappings = await listLinearMappingsForOrg(db, organizationId);
  if (mappings.length === 0) return [];

  const mappingIds = mappings.map((mapping) => mapping.id);
  const configRows = await db
    .select()
    .from(linearAgentConfig)
    .where(
      and(
        eq(linearAgentConfig.organizationId, organizationId),
        inArray(linearAgentConfig.mappingId, mappingIds),
      ),
    );

  const configByMapping = new Map(configRows.map((row) => [row.mappingId, mapConfig(row)]));

  return mappings.map((mapping) => {
    const config = configByMapping.get(mapping.id);
    return {
      ...(config ?? {
        id: "",
        organizationId,
        mappingId: mapping.id,
        enabled: false,
        model: "",
        instructions: "",
        targetBranch: "main",
        tools: { ...DEFAULT_AGENT_TOOLS },
        createdAt: "",
        updatedAt: "",
      }),
      projectId: mapping.projectId,
      projectName: mapping.projectName,
      provider: mapping.provider,
      namespace: mapping.namespace,
      repoName: mapping.repoName,
      projectSourceControlConnectionId: mapping.projectSourceControlConnectionId,
    };
  });
}

export async function getLinearAgentConfigForMapping(
  db: Database,
  organizationId: string,
  mappingId: string,
): Promise<LinearAgentConfigRecord | null> {
  const rows = await db
    .select()
    .from(linearAgentConfig)
    .where(
      and(
        eq(linearAgentConfig.organizationId, organizationId),
        eq(linearAgentConfig.mappingId, mappingId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? mapConfig(row) : null;
}

export async function upsertLinearAgentConfig(
  db: Database,
  input: {
    organizationId: string;
    mappingId: string;
    enabled?: boolean;
    model?: string;
    instructions?: string;
    targetBranch?: string;
    tools?: WorkflowTools;
  },
): Promise<LinearAgentConfigRecord> {
  const existing = await getLinearAgentConfigForMapping(db, input.organizationId, input.mappingId);
  const values = {
    enabled: input.enabled ?? existing?.enabled ?? false,
    model: input.model ?? existing?.model ?? "",
    instructions: input.instructions ?? existing?.instructions ?? "",
    targetBranch: input.targetBranch ?? existing?.targetBranch ?? "main",
    tools: input.tools ?? existing?.tools ?? DEFAULT_AGENT_TOOLS,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(linearAgentConfig)
      .set(values)
      .where(eq(linearAgentConfig.id, existing.id));
    const updated = await db
      .select()
      .from(linearAgentConfig)
      .where(eq(linearAgentConfig.id, existing.id))
      .limit(1);
    return mapConfig(updated[0]!);
  }

  const id = randomUUID();
  await db.insert(linearAgentConfig).values({
    id,
    organizationId: input.organizationId,
    mappingId: input.mappingId,
    ...values,
  });
  const inserted = await db
    .select()
    .from(linearAgentConfig)
    .where(eq(linearAgentConfig.id, id))
    .limit(1);
  return mapConfig(inserted[0]!);
}

export async function orgCloudWorkersAvailable(
  db: Database,
  organizationId: string,
): Promise<boolean> {
  const rows = await db
    .select({ cloudWorkersEnabled: organization.cloudWorkersEnabled })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return rows[0]?.cloudWorkersEnabled ?? false;
}

export async function upsertLinearAgentSession(
  db: Database,
  input: {
    organizationId: string;
    mappingId?: string | null;
    linearAgentSessionId: string;
    linearIssueId?: string | null;
    issueIdentifier?: string | null;
  },
): Promise<LinearAgentSessionRecord> {
  const existing = await db
    .select()
    .from(linearAgentSession)
    .where(eq(linearAgentSession.linearAgentSessionId, input.linearAgentSessionId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(linearAgentSession)
      .set({
        mappingId: input.mappingId ?? existing[0].mappingId,
        linearIssueId: input.linearIssueId ?? existing[0].linearIssueId,
        issueIdentifier: input.issueIdentifier ?? existing[0].issueIdentifier,
        updatedAt: new Date(),
      })
      .where(eq(linearAgentSession.id, existing[0].id));
    const updated = await db
      .select()
      .from(linearAgentSession)
      .where(eq(linearAgentSession.id, existing[0].id))
      .limit(1);
    return mapSession(updated[0]!);
  }

  const id = randomUUID();
  await db.insert(linearAgentSession).values({
    id,
    organizationId: input.organizationId,
    mappingId: input.mappingId ?? null,
    linearAgentSessionId: input.linearAgentSessionId,
    linearIssueId: input.linearIssueId ?? null,
    issueIdentifier: input.issueIdentifier ?? null,
    status: "active",
  });
  const inserted = await db
    .select()
    .from(linearAgentSession)
    .where(eq(linearAgentSession.id, id))
    .limit(1);
  return mapSession(inserted[0]!);
}

export async function getLinearAgentSessionByLinearId(
  db: Database,
  linearAgentSessionId: string,
): Promise<LinearAgentSessionRecord | null> {
  const rows = await db
    .select()
    .from(linearAgentSession)
    .where(eq(linearAgentSession.linearAgentSessionId, linearAgentSessionId))
    .limit(1);
  const row = rows[0];
  return row ? mapSession(row) : null;
}

export async function listRecentLinearAgentSessions(
  db: Database,
  organizationId: string,
  limit = 20,
): Promise<LinearAgentSessionRecord[]> {
  const rows = await db
    .select()
    .from(linearAgentSession)
    .where(eq(linearAgentSession.organizationId, organizationId))
    .orderBy(desc(linearAgentSession.updatedAt))
    .limit(limit);
  return rows.map(mapSession);
}

export async function resolveLinearAgentConnectionIds(
  db: Database,
  mapping: Awaited<ReturnType<typeof findLinearMappingByProjectId>>,
): Promise<{ connectionId: string; projectSourceControlConnectionId: string } | null> {
  if (!mapping) return null;

  if (mapping.projectSourceControlConnectionId) {
    const rows = await db
      .select({
        connectionId: projectSourceControlConnection.connectionId,
        projectSourceControlConnectionId: projectSourceControlConnection.id,
      })
      .from(projectSourceControlConnection)
      .where(eq(projectSourceControlConnection.id, mapping.projectSourceControlConnectionId))
      .limit(1);

    const row = rows[0];
    if (row?.connectionId) {
      return {
        connectionId: row.connectionId,
        projectSourceControlConnectionId: row.projectSourceControlConnectionId,
      };
    }
  }

  const rows = await db
    .select({
      connectionId: projectSourceControlConnection.connectionId,
      projectSourceControlConnectionId: projectSourceControlConnection.id,
    })
    .from(projectSourceControlConnection)
    .where(
      and(
        eq(projectSourceControlConnection.organizationId, mapping.organizationId),
        eq(projectSourceControlConnection.provider, mapping.provider as SourceControlProvider),
        sql`lower(${projectSourceControlConnection.namespace}) = ${mapping.namespace.toLowerCase()}`,
        sql`lower(${projectSourceControlConnection.name}) = ${mapping.repoName.toLowerCase()}`,
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row?.connectionId) return null;
  return {
    connectionId: row.connectionId,
    projectSourceControlConnectionId: row.projectSourceControlConnectionId,
  };
}

export async function insertLinearAgentRun(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    sessionId: string;
    mappingId: string;
    provider: string;
    namespace: string;
    repoName: string;
    projectSourceControlConnectionId: string;
    connectionId: string;
    trigger: LinearAgentTrigger;
    deliveryId: string;
    payload: Record<string, unknown>;
  },
): Promise<{ inserted: boolean; id?: string }> {
  const id = randomUUID();
  const rows = await db
    .insert(linearAgentRun)
    .values({
      id,
      organizationId: input.organizationId,
      userId: input.userId,
      sessionId: input.sessionId,
      mappingId: input.mappingId,
      projectSourceControlConnectionId: input.projectSourceControlConnectionId,
      connectionId: input.connectionId,
      provider: input.provider,
      namespace: input.namespace,
      repoName: input.repoName,
      trigger: input.trigger,
      deliveryId: input.deliveryId,
      status: "pending",
      payload: input.payload,
    })
    .onConflictDoNothing({ target: linearAgentRun.deliveryId })
    .returning({ id: linearAgentRun.id });

  if (!rows[0]) {
    return { inserted: false };
  }

  const { maybeDispatchCloudLinearAgentRun } = await import(
    "../cloud-worker/dispatch-linear-agent-sandbox.js"
  );
  await maybeDispatchCloudLinearAgentRun(db, {
    runId: rows[0].id,
    organizationId: input.organizationId,
  });

  return { inserted: true, id: rows[0].id };
}

export async function getLinearAgentRunForOrg(
  db: Database,
  organizationId: string,
  runId: string,
): Promise<LinearAgentRunRecord | null> {
  const rows = await db
    .select()
    .from(linearAgentRun)
    .where(and(eq(linearAgentRun.id, runId), eq(linearAgentRun.organizationId, organizationId)))
    .limit(1);
  const row = rows[0];
  return row ? mapRun(row) : null;
}

export async function getLinearAgentRunById(
  db: Database,
  runId: string,
): Promise<LinearAgentRunRecord | null> {
  const rows = await db
    .select()
    .from(linearAgentRun)
    .where(eq(linearAgentRun.id, runId))
    .limit(1);
  const row = rows[0];
  return row ? mapRun(row) : null;
}

export async function listPendingLinearAgentRuns(db: Database): Promise<LinearAgentRunRecord[]> {
  const rows = await db
    .select()
    .from(linearAgentRun)
    .where(eq(linearAgentRun.status, "pending"))
    .orderBy(desc(linearAgentRun.createdAt))
    .limit(50);
  return rows.map(mapRun);
}

export async function listPendingLinearAgentRunsForOrg(
  db: Database,
  organizationId: string,
): Promise<LinearAgentRunRecord[]> {
  const rows = await db
    .select()
    .from(linearAgentRun)
    .where(
      and(eq(linearAgentRun.organizationId, organizationId), eq(linearAgentRun.status, "pending")),
    )
    .orderBy(desc(linearAgentRun.createdAt))
    .limit(50);
  return rows.map(mapRun);
}

export async function listActiveLinearAgentRunsForWorker(
  db: Database,
  runnerInstanceId: string,
): Promise<LinearAgentRunRecord[]> {
  const rows = await db
    .select()
    .from(linearAgentRun)
    .where(
      and(
        eq(linearAgentRun.claimedBy, runnerInstanceId),
        inArray(linearAgentRun.status, ["claimed", "running"]),
      ),
    )
    .orderBy(desc(linearAgentRun.updatedAt))
    .limit(50);
  return rows.map(mapRun);
}

export async function claimLinearAgentRun(
  db: Database,
  options: {
    runId: string;
    organizationId: string;
    claimedBy: string;
    runnerInstanceId: string;
  },
): Promise<LinearAgentRunRecord | null> {
  const rows = await db
    .update(linearAgentRun)
    .set({
      status: "claimed",
      claimedBy: options.claimedBy || options.runnerInstanceId,
      runnerKind: "cloud",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(linearAgentRun.id, options.runId),
        eq(linearAgentRun.organizationId, options.organizationId),
        eq(linearAgentRun.status, "pending"),
      ),
    )
    .returning();
  const row = rows[0];
  return row ? mapRun(row) : null;
}

export async function updateLinearAgentRunStatus(
  db: Database,
  runId: string,
  organizationId: string,
  status: "running" | "done" | "failed",
  options?: {
    errorMessage?: string;
    resultMarkdown?: string;
  },
): Promise<void> {
  await db
    .update(linearAgentRun)
    .set({
      status,
      errorMessage: options?.errorMessage ?? null,
      resultMarkdown: options?.resultMarkdown ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(linearAgentRun.id, runId), eq(linearAgentRun.organizationId, organizationId)));
}

export async function updateLinearAgentSessionStatus(
  db: Database,
  sessionId: string,
  organizationId: string,
  status: "active" | "complete" | "error",
): Promise<void> {
  await db
    .update(linearAgentSession)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(linearAgentSession.id, sessionId),
        eq(linearAgentSession.organizationId, organizationId),
      ),
    );
}

export async function resolveLinearAgentMappingContext(
  db: Database,
  organizationId: string,
  projectId: string,
): Promise<{
  mapping: NonNullable<Awaited<ReturnType<typeof findLinearMappingByProjectId>>>;
  config: LinearAgentConfigRecord;
  connectionIds: { connectionId: string; projectSourceControlConnectionId: string };
} | null> {
  const mapping = await findLinearMappingByProjectId(db, organizationId, projectId);
  if (!mapping) return null;

  const connectionIds = await resolveLinearAgentConnectionIds(db, mapping);
  if (!connectionIds) return null;

  const config =
    (await getLinearAgentConfigForMapping(db, organizationId, mapping.id)) ??
    ({
      id: "",
      organizationId,
      mappingId: mapping.id,
      enabled: false,
      model: "",
      instructions: "",
      targetBranch: "main",
      tools: { ...DEFAULT_AGENT_TOOLS },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    } satisfies LinearAgentConfigRecord);

  return { mapping, config, connectionIds };
}

export { DEFAULT_AGENT_TOOLS };
