import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
  type Database,
} from "@openharness/db";
import {
  projectSourceControlConnection,
  sourceControlConnection,
  workflow,
  workflowRun,
  workflowSetting,
  organization,
  type SourceControlProvider,
} from "@openharness/db/schema";
import type { WorkflowResolvedExecutor } from "@openharness/shared/workflow-execution";
import { resolveExecutorForWorkflowRun } from "../cloud-worker/resolve-executor.js";
import {
  getRunnerBindingForConnection,
} from "./runner-bindings-db.js";
import {
  createTriggersFromTemplate,
  getWorkflowTemplate,
  type WorkflowType,
} from "./workflow-constants.js";
import {
  DEFAULT_WORKFLOW_TOOLS,
  isWorkflowTools,
  isWorkflowTrigger,
  triggerEventLabel,
  WORKFLOW_TRIGGER_EVENTS,
  type WorkflowRecord,
  type WorkflowRunDetail,
  type WorkflowRunResultPayload,
  type WorkflowRunStats,
  type WorkflowRunSummary,
  type WorkflowTools,
  type WorkflowTrigger,
  type WorkflowTriggerEvent,
} from "./workflow-types.js";

export function canViewWorkflow(
  row: { localOnly: boolean; userId: string },
  viewerUserId: string,
): boolean {
  return !row.localOnly || row.userId === viewerUserId;
}

export function canMutateWorkflow(
  row: { localOnly: boolean; userId: string },
  actorUserId: string,
): boolean {
  if (row.localOnly) return row.userId === actorUserId;
  return true;
}

function localWorkflowVisibilityCondition(viewerUserId: string) {
  return or(eq(workflow.localOnly, false), eq(workflow.userId, viewerUserId))!;
}

function localWorkflowRunVisibilityCondition(viewerUserId: string) {
  return or(
    sql`${workflow.id} IS NULL`,
    eq(workflow.localOnly, false),
    eq(workflow.userId, viewerUserId),
  )!;
}

function formatRunEventLabel(event: string): string {
  if (event === "schedule") return "Scheduled";
  if (event === "manual") return "Manual";
  if (event === "teams_mention") return "Teams @mention";
  if (event === "discord_mention") return "Discord mention";
  if (event === "linear_issue_created") return "Linear issue created";
  if (event === "linear_issue_updated") return "Linear issue updated";
  if (event === "linear_comment_created") return "Linear comment created";
  if (WORKFLOW_TRIGGER_EVENTS.includes(event as WorkflowTriggerEvent)) {
    return triggerEventLabel(event as WorkflowTriggerEvent);
  }
  return event;
}

const MAX_RESULT_MARKDOWN = 65_536;

export function capResultMarkdown(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_RESULT_MARKDOWN ? trimmed.slice(0, MAX_RESULT_MARKDOWN) : trimmed;
}

function parseResultPayload(value: unknown): WorkflowRunResultPayload | null {
  if (!value || typeof value !== "object") return null;
  const kind = (value as { kind?: unknown }).kind;
  if (
    kind === "cve_scan" ||
    kind === "bug_triage" ||
    kind === "pr_review" ||
    kind === "generic"
  ) {
    return value as WorkflowRunResultPayload;
  }
  return null;
}

type WorkflowRunRow = {
  id: string;
  workflowId: string | null;
  workflowName: string | null;
  event: string;
  prNumber: number;
  status: string;
  errorMessage: string | null;
  iteration: number;
  createdAt: Date;
  updatedAt: Date;
  resultMarkdown?: string | null;
  resultPayload?: unknown;
  resolvedExecutor?: string;
  runnerKind?: string | null;
};

function mapRunRowToSummary(row: WorkflowRunRow): WorkflowRunSummary {
  const durationMs = row.updatedAt.getTime() - row.createdAt.getTime();
  return {
    id: row.id,
    workflowId: row.workflowId,
    workflowName: row.workflowName,
    triggerLabel: formatRunEventLabel(row.event),
    event: row.event,
    prNumber: row.prNumber,
    status: row.status,
    errorMessage: row.errorMessage,
    iteration: row.iteration,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    resolvedExecutor: row.resolvedExecutor === "cloud" ? "cloud" : "local",
    runnerKind:
      row.runnerKind === "cloud" || row.runnerKind === "desktop" ? row.runnerKind : null,
  };
}

export function mapRunRowToDetail(row: WorkflowRunRow): WorkflowRunDetail {
  return {
    ...mapRunRowToSummary(row),
    resultMarkdown: row.resultMarkdown ?? null,
    resultPayload: parseResultPayload(row.resultPayload),
  };
}

export async function listConnectionsForRepo(
  db: Database,
  connectionExternalId: string,
  owner: string,
  repo: string,
) {
  const rows = await db
    .select({ connection: projectSourceControlConnection })
    .from(projectSourceControlConnection)
    .innerJoin(
      sourceControlConnection,
      eq(projectSourceControlConnection.connectionId, sourceControlConnection.id),
    )
    .where(
      and(
        eq(sourceControlConnection.externalOrgId, connectionExternalId),
        sql`lower(${projectSourceControlConnection.namespace}) = ${owner.toLowerCase()}`,
        sql`lower(${projectSourceControlConnection.name}) = ${repo.toLowerCase()}`,
      ),
    );

  return rows.map((row) => row.connection);
}

export async function listConnectionsForProviderRepo(
  db: Database,
  provider: SourceControlProvider,
  namespace: string,
  repoName: string,
) {
  const rows = await db
    .select({ connection: projectSourceControlConnection })
    .from(projectSourceControlConnection)
    .where(
      and(
        eq(projectSourceControlConnection.provider, provider),
        sql`lower(${projectSourceControlConnection.namespace}) = ${namespace.toLowerCase()}`,
        sql`lower(${projectSourceControlConnection.name}) = ${repoName.toLowerCase()}`,
      ),
    );

  return rows.map((row) => row.connection);
}

function normalizeTools(value: unknown): WorkflowTools {
  if (!isWorkflowTools(value)) return { ...DEFAULT_WORKFLOW_TOOLS };
  return {
    prComment: value.prComment,
    prApprove: value.prApprove,
    prPush: value.prPush,
    prCreate: value.prCreate ?? false,
    teamsNotify: value.teamsNotify ?? false,
    discordNotify: value.discordNotify ?? false,
  };
}

function normalizeTriggers(value: unknown): WorkflowTrigger[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isWorkflowTrigger);
}

function mapWorkflowRow(row: {
  id: string;
  userId: string;
  connectionId: string;
  name: string;
  enabled: boolean;
  localOnly: boolean;
  executionTarget?: string;
  model: string;
  instructions: string;
  targetBranch: string;
  triggers: unknown;
  tools: unknown;
  owner: string;
  repo: string;
  projectPath?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WorkflowRecord {
  return {
    id: row.id,
    userId: row.userId,
    connectionId: row.connectionId,
    name: row.name,
    enabled: row.enabled,
    localOnly: row.localOnly,
    executionTarget:
      row.executionTarget === "local" ||
      row.executionTarget === "cloud" ||
      row.executionTarget === "auto"
        ? row.executionTarget
        : "auto",
    model: row.model,
    instructions: row.instructions,
    targetBranch: row.targetBranch,
    triggers: normalizeTriggers(row.triggers),
    tools: normalizeTools(row.tools),
    fullName: `${row.owner}/${row.repo}`,
    owner: row.owner,
    repo: row.repo,
    projectPath: row.projectPath ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function migrateLegacyWorkflowSettings(
  db: Database,
  organizationId: string,
): Promise<void> {
  const legacyRows = await db
    .select()
    .from(workflowSetting)
    .where(eq(workflowSetting.organizationId, organizationId));

  if (legacyRows.length === 0) return;

  const existingLegacy = await db
    .select({
      connectionId: workflow.projectSourceControlConnectionId,
      legacyType: workflow.legacyWorkflowType,
      userId: workflow.userId,
    })
    .from(workflow)
    .where(eq(workflow.organizationId, organizationId));

  const migrated = new Set(
    existingLegacy
      .filter((row) => row.legacyType)
      .map((row) => `${row.connectionId}:${row.legacyType}`),
  );

  for (const legacy of legacyRows) {
    const key = `${legacy.projectSourceControlConnectionId}:${legacy.workflowType}`;
    if (migrated.has(key)) continue;

    const template = getWorkflowTemplate(legacy.workflowType as WorkflowType);
    await db.insert(workflow).values({
      id: randomUUID(),
      organizationId,
      userId: legacy.userId,
      projectSourceControlConnectionId: legacy.projectSourceControlConnectionId,
      name: template.name,
      enabled: legacy.enabled,
      model: template.model,
      instructions: template.instructions,
      triggers: createTriggersFromTemplate(legacy.workflowType as WorkflowType),
      tools: template.tools,
      legacyWorkflowType: legacy.workflowType,
    });
  }
}

export async function listOrgWorkflows(
  db: Database,
  organizationId: string,
  viewerUserId?: string,
): Promise<WorkflowRecord[]> {
  await migrateLegacyWorkflowSettings(db, organizationId);

  const conditions = [eq(workflow.organizationId, organizationId)];
  if (viewerUserId) {
    conditions.push(localWorkflowVisibilityCondition(viewerUserId));
  } else {
    conditions.push(eq(workflow.localOnly, false));
  }

  const rows = await db
    .select({
      id: workflow.id,
      userId: workflow.userId,
      connectionId: workflow.projectSourceControlConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      localOnly: workflow.localOnly,
      executionTarget: workflow.executionTarget,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectSourceControlConnection.namespace,
      repo: projectSourceControlConnection.name,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectSourceControlConnection,
      eq(workflow.projectSourceControlConnectionId, projectSourceControlConnection.id),
    )
    .where(and(...conditions))
    .orderBy(desc(workflow.updatedAt));

  return rows.map(mapWorkflowRow);
}

export async function getOrgWorkflow(
  db: Database,
  organizationId: string,
  workflowId: string,
  viewerUserId?: string,
): Promise<WorkflowRecord | null> {
  await migrateLegacyWorkflowSettings(db, organizationId);

  const rows = await db
    .select({
      id: workflow.id,
      userId: workflow.userId,
      connectionId: workflow.projectSourceControlConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      localOnly: workflow.localOnly,
      executionTarget: workflow.executionTarget,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectSourceControlConnection.namespace,
      repo: projectSourceControlConnection.name,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectSourceControlConnection,
      eq(workflow.projectSourceControlConnectionId, projectSourceControlConnection.id),
    )
    .where(and(eq(workflow.organizationId, organizationId), eq(workflow.id, workflowId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (viewerUserId && !canViewWorkflow(row, viewerUserId)) return null;
  return mapWorkflowRow(row);
}

export async function getOrgWorkflowWithConnection(
  db: Database,
  organizationId: string,
  workflowId: string,
  viewerUserId?: string,
): Promise<(WorkflowRecord & { installationId: string; sourceConnectionId: string; provider: string; userId: string }) | null> {
  await migrateLegacyWorkflowSettings(db, organizationId);

  const rows = await db
    .select({
      id: workflow.id,
      userId: workflow.userId,
      connectionId: workflow.projectSourceControlConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      localOnly: workflow.localOnly,
      executionTarget: workflow.executionTarget,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectSourceControlConnection.namespace,
      repo: projectSourceControlConnection.name,
      installationId: sourceControlConnection.externalOrgId,
      sourceConnectionId: projectSourceControlConnection.connectionId,
      provider: projectSourceControlConnection.provider,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectSourceControlConnection,
      eq(workflow.projectSourceControlConnectionId, projectSourceControlConnection.id),
    )
    .innerJoin(
      sourceControlConnection,
      eq(projectSourceControlConnection.connectionId, sourceControlConnection.id),
    )
    .where(and(eq(workflow.organizationId, organizationId), eq(workflow.id, workflowId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (viewerUserId && !canViewWorkflow(row, viewerUserId)) return null;
  return {
    ...mapWorkflowRow(row),
    installationId: row.installationId,
    sourceConnectionId: row.sourceConnectionId,
    provider: row.provider,
    userId: row.userId,
  };
}

export async function createOrgWorkflow(
  db: Database,
  organizationId: string,
  userId: string,
  input: {
    connectionId: string;
    name?: string;
    enabled?: boolean;
    model?: string;
    instructions?: string;
    targetBranch?: string;
    triggers?: WorkflowTrigger[];
    tools?: WorkflowTools;
    legacyWorkflowType?: WorkflowType;
    localOnly?: boolean;
    executionTarget?: string;
  },
): Promise<WorkflowRecord> {
  const id = randomUUID();
  await db.insert(workflow).values({
    id,
    organizationId,
    userId,
    projectSourceControlConnectionId: input.connectionId,
    name: input.name ?? "Untitled",
    enabled: input.enabled ?? false,
    localOnly: input.localOnly ?? false,
    executionTarget: input.executionTarget ?? "auto",
    model: input.model ?? "",
    instructions: input.instructions ?? "",
    targetBranch: input.targetBranch ?? "",
    triggers: input.triggers ?? [],
    tools: input.tools ?? DEFAULT_WORKFLOW_TOOLS,
    legacyWorkflowType: input.legacyWorkflowType ?? null,
  });

  const created = await getOrgWorkflow(db, organizationId, id, userId);
  if (!created) throw new Error("Failed to create workflow");
  return created;
}

export async function updateOrgWorkflow(
  db: Database,
  organizationId: string,
  workflowId: string,
  input: Partial<{
    connectionId: string;
    name: string;
    enabled: boolean;
    localOnly: boolean;
    executionTarget: string;
    model: string;
    instructions: string;
    targetBranch: string;
    triggers: WorkflowTrigger[];
    tools: WorkflowTools;
  }>,
  viewerUserId?: string,
): Promise<WorkflowRecord | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.connectionId !== undefined) patch.projectSourceControlConnectionId = input.connectionId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.localOnly !== undefined) patch.localOnly = input.localOnly;
  if (input.executionTarget !== undefined) patch.executionTarget = input.executionTarget;
  if (input.model !== undefined) patch.model = input.model;
  if (input.instructions !== undefined) patch.instructions = input.instructions;
  if (input.targetBranch !== undefined) patch.targetBranch = input.targetBranch;
  if (input.triggers !== undefined) patch.triggers = input.triggers;
  if (input.tools !== undefined) patch.tools = input.tools;

  await db
    .update(workflow)
    .set(patch)
    .where(and(eq(workflow.organizationId, organizationId), eq(workflow.id, workflowId)));

  return getOrgWorkflow(db, organizationId, workflowId, viewerUserId);
}

export async function deleteOrgWorkflow(
  db: Database,
  organizationId: string,
  workflowId: string,
  actorUserId?: string,
): Promise<boolean> {
  if (actorUserId) {
    const existing = await db
      .select({
        localOnly: workflow.localOnly,
        userId: workflow.userId,
      })
      .from(workflow)
      .where(and(eq(workflow.organizationId, organizationId), eq(workflow.id, workflowId)))
      .limit(1);
    const row = existing[0];
    if (!row) return false;
    if (!canMutateWorkflow(row, actorUserId)) return false;
  }

  const rows = await db
    .delete(workflow)
    .where(and(eq(workflow.organizationId, organizationId), eq(workflow.id, workflowId)))
    .returning({ id: workflow.id });
  return rows.length > 0;
}

export async function listEnabledWorkflowsForConnection(
  db: Database,
  connectionId: string,
): Promise<WorkflowRecord[]> {
  const rows = await db
    .select({
      id: workflow.id,
      userId: workflow.userId,
      connectionId: workflow.projectSourceControlConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      localOnly: workflow.localOnly,
      executionTarget: workflow.executionTarget,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectSourceControlConnection.namespace,
      repo: projectSourceControlConnection.name,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectSourceControlConnection,
      eq(workflow.projectSourceControlConnectionId, projectSourceControlConnection.id),
    )
    .where(
      and(eq(workflow.projectSourceControlConnectionId, connectionId), eq(workflow.enabled, true)),
    );

  return rows.map(mapWorkflowRow);
}

export async function listEnabledWorkflowsWithSchedules(
  db: Database,
): Promise<
  Array<WorkflowRecord & { organizationId: string; userId: string; installationId: string; sourceConnectionId: string; provider: string }>
> {
  const rows = await db
    .select({
      id: workflow.id,
      organizationId: workflow.organizationId,
      userId: workflow.userId,
      connectionId: workflow.projectSourceControlConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      localOnly: workflow.localOnly,
      executionTarget: workflow.executionTarget,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectSourceControlConnection.namespace,
      repo: projectSourceControlConnection.name,
      installationId: sourceControlConnection.externalOrgId,
      sourceConnectionId: projectSourceControlConnection.connectionId,
      provider: projectSourceControlConnection.provider,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectSourceControlConnection,
      eq(workflow.projectSourceControlConnectionId, projectSourceControlConnection.id),
    )
    .innerJoin(
      sourceControlConnection,
      eq(projectSourceControlConnection.connectionId, sourceControlConnection.id),
    )
    .where(eq(workflow.enabled, true));

  return rows
    .map((row) => ({
      ...mapWorkflowRow(row),
      organizationId: row.organizationId,
      userId: row.userId,
      installationId: row.installationId,
      sourceConnectionId: row.sourceConnectionId,
      provider: row.provider,
    }))
    .filter((row) => row.triggers.some((trigger) => trigger.kind === "schedule"));
}

export async function getPrIterationCount(
  db: Database,
  owner: string,
  repo: string,
  prNumber: number,
  workflowId: string,
): Promise<number> {
  const rows = await db
    .select({ maxIteration: sql<number>`coalesce(max(${workflowRun.iteration}), 0)` })
    .from(workflowRun)
    .where(
      and(
        sql`lower(${workflowRun.namespace}) = ${owner.toLowerCase()}`,
        sql`lower(${workflowRun.repoName}) = ${repo.toLowerCase()}`,
        eq(workflowRun.prNumber, prNumber),
        eq(workflowRun.workflowId, workflowId),
      ),
    );
  return rows[0]?.maxIteration ?? 0;
}

export async function insertWorkflowRun(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    workflowId: string;
    workflowType?: string | null;
    projectSourceControlConnectionId: string;
    projectPath?: string | null;
    connectionId: string;
    provider: SourceControlProvider;
    namespace: string;
    repoName: string;
    prNumber: number;
    event: string;
    deliveryId: string;
    iteration: number;
    payload: Record<string, unknown>;
    resolvedExecutor?: WorkflowResolvedExecutor;
  },
): Promise<{ inserted: boolean; id?: string }> {
  const id = randomUUID();
  const resolvedExecutor: WorkflowResolvedExecutor =
    input.resolvedExecutor ??
    (await resolveExecutorForWorkflowRun(db, input.organizationId, input.workflowId));
  const rows = await db
    .insert(workflowRun)
    .values({
      id,
      organizationId: input.organizationId,
      userId: input.userId,
      workflowId: input.workflowId,
      workflowType: input.workflowType ?? null,
      projectSourceControlConnectionId: input.projectSourceControlConnectionId,
      projectPath: input.projectPath ?? null,
      connectionId: input.connectionId,
      provider: input.provider,
      namespace: input.namespace,
      repoName: input.repoName,
      prNumber: input.prNumber,
      event: input.event,
      deliveryId: input.deliveryId,
      status: "pending",
      iteration: input.iteration,
      payload: input.payload,
      resolvedExecutor,
    })
    .onConflictDoNothing({ target: workflowRun.deliveryId })
    .returning({ id: workflowRun.id });

  if (!rows[0]) {
    return { inserted: false };
  }

  if (resolvedExecutor === "cloud") {
    const { maybeDispatchCloudWorkflowRun } = await import("../cloud-worker/dispatch-sandbox.js");
    await maybeDispatchCloudWorkflowRun(db, {
      runId: rows[0].id,
      organizationId: input.organizationId,
    });
  }

  return { inserted: true, id: rows[0].id };
}

export async function listPendingRunsForOrg(
  db: Database,
  organizationId: string,
  options?: { since?: Date; connectionIds?: string[]; runnerUserId?: string },
) {
  const conditions = [
    eq(workflowRun.organizationId, organizationId),
    eq(workflowRun.status, "pending"),
    eq(workflowRun.resolvedExecutor, "local"),
  ];
  if (options?.since) {
    conditions.push(sql`${workflowRun.createdAt} >= ${options.since}`);
  }
  if (options?.connectionIds && options.connectionIds.length > 0) {
    conditions.push(inArray(workflowRun.projectSourceControlConnectionId, options.connectionIds));
  }
  if (options?.runnerUserId) {
    conditions.push(localWorkflowRunVisibilityCondition(options.runnerUserId));
  }

  const rows = await db
    .select({ run: workflowRun })
    .from(workflowRun)
    .leftJoin(workflow, eq(workflowRun.workflowId, workflow.id))
    .where(and(...conditions))
    .orderBy(desc(workflowRun.createdAt))
    .limit(50);

  return rows.map((row) => row.run);
}

export async function listPendingCloudRunsForOrg(db: Database, organizationId: string) {
  const rows = await db
    .select()
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.organizationId, organizationId),
        eq(workflowRun.status, "pending"),
        eq(workflowRun.resolvedExecutor, "cloud"),
      ),
    )
    .orderBy(desc(workflowRun.createdAt))
    .limit(50);

  return rows;
}

export async function listAllPendingCloudRuns(db: Database) {
  const rows = await db
    .select({ run: workflowRun })
    .from(workflowRun)
    .innerJoin(organization, eq(workflowRun.organizationId, organization.id))
    .where(
      and(
        eq(workflowRun.status, "pending"),
        eq(workflowRun.resolvedExecutor, "cloud"),
        eq(organization.cloudWorkersEnabled, true),
      ),
    )
    .orderBy(desc(workflowRun.createdAt))
    .limit(50);

  return rows.map((row) => row.run);
}

export async function listActiveCloudRunsForWorker(
  db: Database,
  runnerInstanceId: string,
): Promise<Array<{ id: string; organizationId: string; status: string }>> {
  return db
    .select({
      id: workflowRun.id,
      organizationId: workflowRun.organizationId,
      status: workflowRun.status,
    })
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.claimedBy, runnerInstanceId),
        eq(workflowRun.runnerKind, "cloud"),
        inArray(workflowRun.status, ["claimed", "running"]),
      ),
    );
}

export async function claimWorkflowRun(
  db: Database,
  runId: string,
  organizationId: string,
  claimedBy: string,
  runnerInstanceId: string,
) {
  const pending = await db
    .select()
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.organizationId, organizationId),
        eq(workflowRun.status, "pending"),
      ),
    )
    .limit(1);

  const run = pending[0];
  if (!run) return null;
  if (run.resolvedExecutor !== "local") return null;

  const binding = await getRunnerBindingForConnection(
    db,
    runnerInstanceId,
    run.projectSourceControlConnectionId,
  );
  if (!binding) return null;

  if (run.workflowId) {
    const workflowRows = await db
      .select({
        localOnly: workflow.localOnly,
        userId: workflow.userId,
      })
      .from(workflow)
      .where(eq(workflow.id, run.workflowId))
      .limit(1);
    const workflowRow = workflowRows[0];
    if (workflowRow?.localOnly && workflowRow.userId !== binding.userId) {
      return null;
    }
  }

  const rows = await db
    .update(workflowRun)
    .set({
      status: "claimed",
      claimedBy,
      projectPath: binding.projectPath,
      runnerKind: "desktop",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.organizationId, organizationId),
        eq(workflowRun.status, "pending"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

export async function claimCloudWorkflowRun(
  db: Database,
  runId: string,
  organizationId: string,
  claimedBy: string,
  runnerInstanceId: string,
) {
  const pending = await db
    .select()
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.organizationId, organizationId),
        eq(workflowRun.status, "pending"),
        eq(workflowRun.resolvedExecutor, "cloud"),
      ),
    )
    .limit(1);

  const run = pending[0];
  if (!run) return null;

  if (run.workflowId) {
    const workflowRows = await db
      .select({
        localOnly: workflow.localOnly,
        userId: workflow.userId,
      })
      .from(workflow)
      .where(eq(workflow.id, run.workflowId))
      .limit(1);
    const workflowRow = workflowRows[0];
    if (workflowRow?.localOnly) {
      return null;
    }
  }

  const rows = await db
    .update(workflowRun)
    .set({
      status: "claimed",
      claimedBy: claimedBy || runnerInstanceId,
      projectPath: null,
      runnerKind: "cloud",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.organizationId, organizationId),
        eq(workflowRun.status, "pending"),
        eq(workflowRun.resolvedExecutor, "cloud"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

export async function updateWorkflowRunStatus(
  db: Database,
  runId: string,
  organizationId: string,
  status: "running" | "done" | "failed",
  options?: {
    errorMessage?: string;
    iteration?: number;
    resultMarkdown?: string;
    resultPayload?: WorkflowRunResultPayload | null;
  },
) {
  const cappedMarkdown = capResultMarkdown(options?.resultMarkdown);
  await db
    .update(workflowRun)
    .set({
      status,
      errorMessage: options?.errorMessage ?? null,
      ...(options?.iteration !== undefined ? { iteration: options.iteration } : {}),
      ...(cappedMarkdown !== undefined ? { resultMarkdown: cappedMarkdown } : {}),
      ...(options?.resultPayload !== undefined
        ? { resultPayload: options.resultPayload }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(workflowRun.id, runId), eq(workflowRun.organizationId, organizationId)));
}

export async function getWorkflowRunForOrg(
  db: Database,
  organizationId: string,
  runId: string,
  viewerUserId?: string,
): Promise<WorkflowRunDetail | null> {
  const conditions = [
    eq(workflowRun.organizationId, organizationId),
    eq(workflowRun.id, runId),
  ];
  if (viewerUserId) {
    conditions.push(localWorkflowRunVisibilityCondition(viewerUserId));
  }

  const rows = await db
    .select({
      id: workflowRun.id,
      workflowId: workflowRun.workflowId,
      workflowName: workflow.name,
      event: workflowRun.event,
      prNumber: workflowRun.prNumber,
      status: workflowRun.status,
      errorMessage: workflowRun.errorMessage,
      iteration: workflowRun.iteration,
      createdAt: workflowRun.createdAt,
      updatedAt: workflowRun.updatedAt,
      resultMarkdown: workflowRun.resultMarkdown,
      resultPayload: workflowRun.resultPayload,
      resolvedExecutor: workflowRun.resolvedExecutor,
      runnerKind: workflowRun.runnerKind,
    })
    .from(workflowRun)
    .leftJoin(workflow, eq(workflowRun.workflowId, workflow.id))
    .where(and(...conditions))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.workflowId && viewerUserId) {
    const workflowRecord = await getOrgWorkflow(db, organizationId, row.workflowId, viewerUserId);
    if (!workflowRecord) return null;
  }

  return mapRunRowToDetail(row);
}

export async function getWorkflowRunExecutionForOrg(
  db: Database,
  organizationId: string,
  runId: string,
) {
  const rows = await db
    .select()
    .from(workflowRun)
    .where(and(eq(workflowRun.organizationId, organizationId), eq(workflowRun.id, runId)))
    .limit(1);
  return rows[0] ?? null;
}

const DISMISSABLE_WORKFLOW_RUN_STATUSES = new Set(["pending", "claimed", "running"]);

export async function dismissWorkflowRunForOrg(
  db: Database,
  organizationId: string,
  runId: string,
  viewerUserId: string,
  errorMessage = "Marked as failed",
): Promise<WorkflowRunDetail | "not_active" | null> {
  const run = await getWorkflowRunForOrg(db, organizationId, runId, viewerUserId);
  if (!run) return null;
  if (!DISMISSABLE_WORKFLOW_RUN_STATUSES.has(run.status)) return "not_active";

  await updateWorkflowRunStatus(db, runId, organizationId, "failed", {
    errorMessage,
  });

  return getWorkflowRunForOrg(db, organizationId, runId, viewerUserId);
}

export async function listActiveRunsForRunner(
  db: Database,
  organizationId: string,
  runnerInstanceId: string,
): Promise<Array<{ id: string; status: string }>> {
  return db
    .select({
      id: workflowRun.id,
      status: workflowRun.status,
    })
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.organizationId, organizationId),
        eq(workflowRun.claimedBy, runnerInstanceId),
        inArray(workflowRun.status, ["claimed", "running"]),
      ),
    );
}

export async function listWorkflowRunsForOrg(
  db: Database,
  organizationId: string,
  options: { workflowId?: string; limit?: number; cursor?: string },
  viewerUserId?: string,
): Promise<{ runs: WorkflowRunSummary[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const conditions = [eq(workflowRun.organizationId, organizationId)];
  if (options.workflowId) {
    conditions.push(eq(workflowRun.workflowId, options.workflowId));
    if (viewerUserId) {
      const workflowRecord = await getOrgWorkflow(
        db,
        organizationId,
        options.workflowId,
        viewerUserId,
      );
      if (!workflowRecord) {
        return { runs: [], nextCursor: null };
      }
    }
  } else if (viewerUserId) {
    conditions.push(localWorkflowRunVisibilityCondition(viewerUserId));
  }
  if (options.cursor) {
    conditions.push(lt(workflowRun.createdAt, new Date(options.cursor)));
  }

  const rows = await db
    .select({
      id: workflowRun.id,
      workflowId: workflowRun.workflowId,
      workflowName: workflow.name,
      event: workflowRun.event,
      prNumber: workflowRun.prNumber,
      status: workflowRun.status,
      errorMessage: workflowRun.errorMessage,
      iteration: workflowRun.iteration,
      createdAt: workflowRun.createdAt,
      updatedAt: workflowRun.updatedAt,
      resolvedExecutor: workflowRun.resolvedExecutor,
      runnerKind: workflowRun.runnerKind,
    })
    .from(workflowRun)
    .leftJoin(workflow, eq(workflowRun.workflowId, workflow.id))
    .where(and(...conditions))
    .orderBy(desc(workflowRun.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const runs: WorkflowRunSummary[] = page.map((row) => mapRunRowToSummary(row));

  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null;
  return { runs, nextCursor };
}

export async function getWorkflowRunStats(
  db: Database,
  organizationId: string,
  workflowId?: string,
  viewerUserId?: string,
): Promise<WorkflowRunStats> {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const conditions = [
    eq(workflowRun.organizationId, organizationId),
    gte(workflowRun.createdAt, since7d),
    inArray(workflowRun.status, ["done", "failed"]),
  ];
  if (workflowId) {
    conditions.push(eq(workflowRun.workflowId, workflowId));
    if (viewerUserId) {
      const workflowRecord = await getOrgWorkflow(db, organizationId, workflowId, viewerUserId);
      if (!workflowRecord) {
        return { successful24h: 0, failed24h: 0, successful7d: 0, failed7d: 0 };
      }
    }
  } else if (viewerUserId) {
    conditions.push(localWorkflowRunVisibilityCondition(viewerUserId));
  }

  const rows = await db
    .select({
      status: workflowRun.status,
      createdAt: workflowRun.createdAt,
    })
    .from(workflowRun)
    .leftJoin(workflow, eq(workflowRun.workflowId, workflow.id))
    .where(and(...conditions));

  const stats: WorkflowRunStats = {
    successful24h: 0,
    failed24h: 0,
    successful7d: 0,
    failed7d: 0,
  };

  for (const row of rows) {
    const isSuccess = row.status === "done";
    const isFailed = row.status === "failed";
    if (row.createdAt >= since24h) {
      if (isSuccess) stats.successful24h += 1;
      if (isFailed) stats.failed24h += 1;
    }
    if (isSuccess) stats.successful7d += 1;
    if (isFailed) stats.failed7d += 1;
  }

  return stats;
}

/** @deprecated */
export async function listUserWorkflowInstances(db: Database, organizationId: string) {
  const workflows = await listOrgWorkflows(db, organizationId);
  return workflows
    .filter((row) => row.enabled)
    .map((row) => ({
      id: row.id,
      connectionId: row.connectionId,
      type: (row as WorkflowRecord & { legacyWorkflowType?: string }).legacyWorkflowType ??
        "custom",
      title: row.name,
      description: row.instructions.slice(0, 160),
      fullName: row.fullName,
      owner: row.owner,
      repo: row.repo,
      projectPath: row.projectPath ?? "",
    }));
}

/** @deprecated */
export async function upsertWorkflowSetting(
  db: Database,
  organizationId: string,
  userId: string,
  connectionId: string,
  workflowType: WorkflowType,
  enabled: boolean,
) {
  await migrateLegacyWorkflowSettings(db, organizationId);

  const existing = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, organizationId),
        eq(workflow.projectSourceControlConnectionId, connectionId),
        eq(workflow.legacyWorkflowType, workflowType),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(workflow)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(workflow.id, existing[0].id));
    return;
  }

  const template = getWorkflowTemplate(workflowType);
  await createOrgWorkflow(db, organizationId, userId, {
    connectionId,
    name: template.name,
    enabled,
    model: template.model,
    instructions: template.instructions,
    triggers: createTriggersFromTemplate(workflowType),
    tools: template.tools,
    legacyWorkflowType: workflowType,
  });
}

/** @deprecated */
export async function isWorkflowEnabled(
  db: Database,
  connectionId: string,
  workflowType: WorkflowType,
): Promise<boolean> {
  const rows = await db
    .select({ enabled: workflow.enabled })
    .from(workflow)
    .where(
      and(
        eq(workflow.projectSourceControlConnectionId, connectionId),
        eq(workflow.legacyWorkflowType, workflowType),
      ),
    )
    .limit(1);
  return rows[0]?.enabled ?? false;
}

export async function listOrgConnectionsWithSettings(db: Database, organizationId: string) {
  const connections = await db
    .select()
    .from(projectSourceControlConnection)
    .where(eq(projectSourceControlConnection.organizationId, organizationId));

  const settings = await db
    .select()
    .from(workflow)
    .where(eq(workflow.organizationId, organizationId));

  const settingsByConnection = new Map<string, Map<string, boolean>>();
  for (const row of settings) {
    if (!settingsByConnection.has(row.projectSourceControlConnectionId)) {
      settingsByConnection.set(row.projectSourceControlConnectionId, new Map());
    }
    const key = row.legacyWorkflowType ?? row.id;
    settingsByConnection.get(row.projectSourceControlConnectionId)!.set(key, row.enabled);
  }

  return connections.map((connection) => {
    const byType = settingsByConnection.get(connection.id);
    const metadata = (connection.metadata ?? {}) as Record<string, string>;
    return {
      connectionId: connection.id,
      provider: connection.provider,
      owner: connection.namespace,
      repo: connection.name,
      fullName: `${connection.namespace}/${connection.name}`,
      installationId: metadata.installationId ?? connection.connectionId,
      workflows: {
        pr_review: byType?.get("pr_review") ?? false,
        comment_fixer: byType?.get("comment_fixer") ?? false,
      },
    };
  });
}

/** @deprecated aliases */
export const listUserWorkflows = listOrgWorkflows;
export const getUserWorkflow = getOrgWorkflow;
export const getUserWorkflowWithConnection = getOrgWorkflowWithConnection;
export const createUserWorkflow = createOrgWorkflow;
export const updateUserWorkflow = updateOrgWorkflow;
export const deleteUserWorkflow = deleteOrgWorkflow;
export const listPendingRunsForUser = listPendingRunsForOrg;
export const listWorkflowRunsForUser = listWorkflowRunsForOrg;
export const listUserConnectionsWithSettings = listOrgConnectionsWithSettings;
