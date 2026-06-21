import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "@openharness/db";
import {
  projectGithubConnection,
  workflow,
  workflowRun,
  workflowSetting,
} from "@openharness/db/schema";
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
  type WorkflowRunStats,
  type WorkflowRunSummary,
  type WorkflowTools,
  type WorkflowTrigger,
  type WorkflowTriggerEvent,
} from "./workflow-types.js";

function formatRunEventLabel(event: string): string {
  if (event === "schedule") return "Scheduled";
  if (event === "manual") return "Manual";
  if (WORKFLOW_TRIGGER_EVENTS.includes(event as WorkflowTriggerEvent)) {
    return triggerEventLabel(event as WorkflowTriggerEvent);
  }
  return event;
}

export async function listConnectionsForRepo(
  db: Database,
  installationId: string,
  owner: string,
  repo: string,
) {
  return db
    .select()
    .from(projectGithubConnection)
    .where(
      and(
        eq(projectGithubConnection.installationId, installationId),
        sql`lower(${projectGithubConnection.githubOwner}) = ${owner.toLowerCase()}`,
        sql`lower(${projectGithubConnection.githubRepo}) = ${repo.toLowerCase()}`,
      ),
    );
}

function normalizeTools(value: unknown): WorkflowTools {
  if (!isWorkflowTools(value)) return { ...DEFAULT_WORKFLOW_TOOLS };
  return value;
}

function normalizeTriggers(value: unknown): WorkflowTrigger[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isWorkflowTrigger);
}

function mapWorkflowRow(row: {
  id: string;
  connectionId: string;
  name: string;
  enabled: boolean;
  model: string;
  instructions: string;
  targetBranch: string;
  triggers: unknown;
  tools: unknown;
  owner: string;
  repo: string;
  projectPath: string;
  createdAt: Date;
  updatedAt: Date;
}): WorkflowRecord {
  return {
    id: row.id,
    connectionId: row.connectionId,
    name: row.name,
    enabled: row.enabled,
    model: row.model,
    instructions: row.instructions,
    targetBranch: row.targetBranch,
    triggers: normalizeTriggers(row.triggers),
    tools: normalizeTools(row.tools),
    fullName: `${row.owner}/${row.repo}`,
    owner: row.owner,
    repo: row.repo,
    projectPath: row.projectPath,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function migrateLegacyWorkflowSettings(db: Database, userId: string): Promise<void> {
  const legacyRows = await db
    .select()
    .from(workflowSetting)
    .where(eq(workflowSetting.userId, userId));

  if (legacyRows.length === 0) return;

  const existingLegacy = await db
    .select({
      connectionId: workflow.projectGithubConnectionId,
      legacyType: workflow.legacyWorkflowType,
    })
    .from(workflow)
    .where(eq(workflow.userId, userId));

  const migrated = new Set(
    existingLegacy
      .filter((row) => row.legacyType)
      .map((row) => `${row.connectionId}:${row.legacyType}`),
  );

  for (const legacy of legacyRows) {
    const key = `${legacy.projectGithubConnectionId}:${legacy.workflowType}`;
    if (migrated.has(key)) continue;

    const template = getWorkflowTemplate(legacy.workflowType as WorkflowType);
    await db.insert(workflow).values({
      id: randomUUID(),
      userId,
      projectGithubConnectionId: legacy.projectGithubConnectionId,
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

export async function listUserWorkflows(db: Database, userId: string): Promise<WorkflowRecord[]> {
  await migrateLegacyWorkflowSettings(db, userId);

  const rows = await db
    .select({
      id: workflow.id,
      connectionId: workflow.projectGithubConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectGithubConnection.githubOwner,
      repo: projectGithubConnection.githubRepo,
      projectPath: projectGithubConnection.projectPath,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectGithubConnection,
      eq(workflow.projectGithubConnectionId, projectGithubConnection.id),
    )
    .where(eq(workflow.userId, userId))
    .orderBy(desc(workflow.updatedAt));

  return rows.map(mapWorkflowRow);
}

export async function getUserWorkflow(
  db: Database,
  userId: string,
  workflowId: string,
): Promise<WorkflowRecord | null> {
  await migrateLegacyWorkflowSettings(db, userId);

  const rows = await db
    .select({
      id: workflow.id,
      connectionId: workflow.projectGithubConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectGithubConnection.githubOwner,
      repo: projectGithubConnection.githubRepo,
      projectPath: projectGithubConnection.projectPath,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectGithubConnection,
      eq(workflow.projectGithubConnectionId, projectGithubConnection.id),
    )
    .where(and(eq(workflow.userId, userId), eq(workflow.id, workflowId)))
    .limit(1);

  const row = rows[0];
  return row ? mapWorkflowRow(row) : null;
}

export async function getUserWorkflowWithConnection(
  db: Database,
  userId: string,
  workflowId: string,
): Promise<(WorkflowRecord & { installationId: string }) | null> {
  await migrateLegacyWorkflowSettings(db, userId);

  const rows = await db
    .select({
      id: workflow.id,
      connectionId: workflow.projectGithubConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectGithubConnection.githubOwner,
      repo: projectGithubConnection.githubRepo,
      projectPath: projectGithubConnection.projectPath,
      installationId: projectGithubConnection.installationId,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectGithubConnection,
      eq(workflow.projectGithubConnectionId, projectGithubConnection.id),
    )
    .where(and(eq(workflow.userId, userId), eq(workflow.id, workflowId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...mapWorkflowRow(row),
    installationId: row.installationId,
  };
}

export async function createUserWorkflow(
  db: Database,
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
  },
): Promise<WorkflowRecord> {
  const id = randomUUID();
  await db.insert(workflow).values({
    id,
    userId,
    projectGithubConnectionId: input.connectionId,
    name: input.name ?? "Untitled",
    enabled: input.enabled ?? false,
    model: input.model ?? "",
    instructions: input.instructions ?? "",
    targetBranch: input.targetBranch ?? "",
    triggers: input.triggers ?? [],
    tools: input.tools ?? DEFAULT_WORKFLOW_TOOLS,
    legacyWorkflowType: input.legacyWorkflowType ?? null,
  });

  const created = await getUserWorkflow(db, userId, id);
  if (!created) throw new Error("Failed to create workflow");
  return created;
}

export async function updateUserWorkflow(
  db: Database,
  userId: string,
  workflowId: string,
  input: Partial<{
    connectionId: string;
    name: string;
    enabled: boolean;
    model: string;
    instructions: string;
    targetBranch: string;
    triggers: WorkflowTrigger[];
    tools: WorkflowTools;
  }>,
): Promise<WorkflowRecord | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.connectionId !== undefined) patch.projectGithubConnectionId = input.connectionId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.model !== undefined) patch.model = input.model;
  if (input.instructions !== undefined) patch.instructions = input.instructions;
  if (input.targetBranch !== undefined) patch.targetBranch = input.targetBranch;
  if (input.triggers !== undefined) patch.triggers = input.triggers;
  if (input.tools !== undefined) patch.tools = input.tools;

  await db
    .update(workflow)
    .set(patch)
    .where(and(eq(workflow.userId, userId), eq(workflow.id, workflowId)));

  return getUserWorkflow(db, userId, workflowId);
}

export async function deleteUserWorkflow(
  db: Database,
  userId: string,
  workflowId: string,
): Promise<boolean> {
  const rows = await db
    .delete(workflow)
    .where(and(eq(workflow.userId, userId), eq(workflow.id, workflowId)))
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
      connectionId: workflow.projectGithubConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectGithubConnection.githubOwner,
      repo: projectGithubConnection.githubRepo,
      projectPath: projectGithubConnection.projectPath,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectGithubConnection,
      eq(workflow.projectGithubConnectionId, projectGithubConnection.id),
    )
    .where(
      and(eq(workflow.projectGithubConnectionId, connectionId), eq(workflow.enabled, true)),
    );

  return rows.map(mapWorkflowRow);
}

export async function listEnabledWorkflowsWithSchedules(
  db: Database,
): Promise<Array<WorkflowRecord & { userId: string; installationId: string }>> {
  const rows = await db
    .select({
      id: workflow.id,
      userId: workflow.userId,
      connectionId: workflow.projectGithubConnectionId,
      name: workflow.name,
      enabled: workflow.enabled,
      model: workflow.model,
      instructions: workflow.instructions,
      targetBranch: workflow.targetBranch,
      triggers: workflow.triggers,
      tools: workflow.tools,
      owner: projectGithubConnection.githubOwner,
      repo: projectGithubConnection.githubRepo,
      projectPath: projectGithubConnection.projectPath,
      installationId: projectGithubConnection.installationId,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    })
    .from(workflow)
    .innerJoin(
      projectGithubConnection,
      eq(workflow.projectGithubConnectionId, projectGithubConnection.id),
    )
    .where(eq(workflow.enabled, true));

  return rows
    .map((row) => ({
      ...mapWorkflowRow(row),
      userId: row.userId,
      installationId: row.installationId,
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
        sql`lower(${workflowRun.githubOwner}) = ${owner.toLowerCase()}`,
        sql`lower(${workflowRun.githubRepo}) = ${repo.toLowerCase()}`,
        eq(workflowRun.prNumber, prNumber),
        eq(workflowRun.workflowId, workflowId),
      ),
    );
  return rows[0]?.maxIteration ?? 0;
}

export async function insertWorkflowRun(
  db: Database,
  input: {
    userId: string;
    workflowId: string;
    workflowType?: string | null;
    projectGithubConnectionId: string;
    projectPath: string;
    installationId: string;
    githubOwner: string;
    githubRepo: string;
    prNumber: number;
    event: string;
    deliveryId: string;
    iteration: number;
    payload: Record<string, unknown>;
  },
): Promise<{ inserted: boolean; id?: string }> {
  const id = randomUUID();
  const rows = await db
    .insert(workflowRun)
    .values({
      id,
      userId: input.userId,
      workflowId: input.workflowId,
      workflowType: input.workflowType ?? null,
      projectGithubConnectionId: input.projectGithubConnectionId,
      projectPath: input.projectPath,
      installationId: input.installationId,
      githubOwner: input.githubOwner,
      githubRepo: input.githubRepo,
      prNumber: input.prNumber,
      event: input.event,
      deliveryId: input.deliveryId,
      status: "pending",
      iteration: input.iteration,
      payload: input.payload,
    })
    .onConflictDoNothing({ target: workflowRun.deliveryId })
    .returning({ id: workflowRun.id });

  if (!rows[0]) {
    return { inserted: false };
  }

  return { inserted: true, id: rows[0].id };
}

export async function listPendingRunsForUser(db: Database, userId: string, since?: Date) {
  const conditions = [eq(workflowRun.userId, userId), eq(workflowRun.status, "pending")];
  if (since) {
    conditions.push(sql`${workflowRun.createdAt} >= ${since}`);
  }

  return db
    .select()
    .from(workflowRun)
    .where(and(...conditions))
    .orderBy(desc(workflowRun.createdAt))
    .limit(50);
}

export async function claimWorkflowRun(
  db: Database,
  runId: string,
  userId: string,
  claimedBy: string,
) {
  const rows = await db
    .update(workflowRun)
    .set({
      status: "claimed",
      claimedBy,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.userId, userId),
        eq(workflowRun.status, "pending"),
      ),
    )
    .returning();

  return rows[0] ?? null;
}

export async function updateWorkflowRunStatus(
  db: Database,
  runId: string,
  userId: string,
  status: "running" | "done" | "failed",
  options?: { errorMessage?: string; iteration?: number },
) {
  await db
    .update(workflowRun)
    .set({
      status,
      errorMessage: options?.errorMessage ?? null,
      ...(options?.iteration !== undefined ? { iteration: options.iteration } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(workflowRun.id, runId), eq(workflowRun.userId, userId)));
}

export async function listWorkflowRunsForUser(
  db: Database,
  userId: string,
  options: { workflowId?: string; limit?: number; cursor?: string },
): Promise<{ runs: WorkflowRunSummary[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const conditions = [eq(workflowRun.userId, userId)];
  if (options.workflowId) {
    conditions.push(eq(workflowRun.workflowId, options.workflowId));
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
    })
    .from(workflowRun)
    .leftJoin(workflow, eq(workflowRun.workflowId, workflow.id))
    .where(and(...conditions))
    .orderBy(desc(workflowRun.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const runs: WorkflowRunSummary[] = page.map((row) => {
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
    };
  });

  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null;
  return { runs, nextCursor };
}

export async function getWorkflowRunStats(
  db: Database,
  userId: string,
  workflowId?: string,
): Promise<WorkflowRunStats> {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const conditions = [
    eq(workflowRun.userId, userId),
    gte(workflowRun.createdAt, since7d),
    inArray(workflowRun.status, ["done", "failed"]),
  ];
  if (workflowId) {
    conditions.push(eq(workflowRun.workflowId, workflowId));
  }

  const rows = await db
    .select({
      status: workflowRun.status,
      createdAt: workflowRun.createdAt,
    })
    .from(workflowRun)
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
export async function listUserWorkflowInstances(db: Database, userId: string) {
  const workflows = await listUserWorkflows(db, userId);
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
      projectPath: row.projectPath,
    }));
}

/** @deprecated */
export async function upsertWorkflowSetting(
  db: Database,
  userId: string,
  connectionId: string,
  workflowType: WorkflowType,
  enabled: boolean,
) {
  await migrateLegacyWorkflowSettings(db, userId);

  const existing = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.userId, userId),
        eq(workflow.projectGithubConnectionId, connectionId),
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
  await createUserWorkflow(db, userId, {
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
        eq(workflow.projectGithubConnectionId, connectionId),
        eq(workflow.legacyWorkflowType, workflowType),
      ),
    )
    .limit(1);
  return rows[0]?.enabled ?? false;
}

export async function listUserConnectionsWithSettings(db: Database, userId: string) {
  const connections = await db
    .select()
    .from(projectGithubConnection)
    .where(eq(projectGithubConnection.userId, userId));

  const settings = await db
    .select()
    .from(workflow)
    .where(eq(workflow.userId, userId));

  const settingsByConnection = new Map<string, Map<string, boolean>>();
  for (const row of settings) {
    if (!settingsByConnection.has(row.projectGithubConnectionId)) {
      settingsByConnection.set(row.projectGithubConnectionId, new Map());
    }
    const key = row.legacyWorkflowType ?? row.id;
    settingsByConnection.get(row.projectGithubConnectionId)!.set(key, row.enabled);
  }

  return connections.map((connection) => {
    const byType = settingsByConnection.get(connection.id);
    return {
      connectionId: connection.id,
      projectPath: connection.projectPath,
      owner: connection.githubOwner,
      repo: connection.githubRepo,
      fullName: `${connection.githubOwner}/${connection.githubRepo}`,
      installationId: connection.installationId,
      workflows: {
        pr_review: byType?.get("pr_review") ?? false,
        comment_fixer: byType?.get("comment_fixer") ?? false,
      },
    };
  });
}
