import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@openharness/db";
import {
  projectGithubConnection,
  workflowRun,
  workflowSetting,
  type WorkflowType,
} from "@openharness/db/schema";
import { DEFAULT_WORKFLOW_DEFINITIONS } from "./workflow-constants.js";

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

export async function isWorkflowEnabled(
  db: Database,
  connectionId: string,
  workflowType: WorkflowType,
): Promise<boolean> {
  const rows = await db
    .select({ enabled: workflowSetting.enabled })
    .from(workflowSetting)
    .where(
      and(
        eq(workflowSetting.projectGithubConnectionId, connectionId),
        eq(workflowSetting.workflowType, workflowType),
      ),
    )
    .limit(1);
  return rows[0]?.enabled ?? false;
}

export async function getPrIterationCount(
  db: Database,
  owner: string,
  repo: string,
  prNumber: number,
  workflowType: WorkflowType,
): Promise<number> {
  const rows = await db
    .select({ maxIteration: sql<number>`coalesce(max(${workflowRun.iteration}), 0)` })
    .from(workflowRun)
    .where(
      and(
        sql`lower(${workflowRun.githubOwner}) = ${owner.toLowerCase()}`,
        sql`lower(${workflowRun.githubRepo}) = ${repo.toLowerCase()}`,
        eq(workflowRun.prNumber, prNumber),
        eq(workflowRun.workflowType, workflowType),
      ),
    );
  return rows[0]?.maxIteration ?? 0;
}

export async function insertWorkflowRun(
  db: Database,
  input: {
    userId: string;
    projectGithubConnectionId: string;
    projectPath: string;
    installationId: string;
    githubOwner: string;
    githubRepo: string;
    prNumber: number;
    workflowType: WorkflowType;
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
      projectGithubConnectionId: input.projectGithubConnectionId,
      projectPath: input.projectPath,
      installationId: input.installationId,
      githubOwner: input.githubOwner,
      githubRepo: input.githubRepo,
      prNumber: input.prNumber,
      workflowType: input.workflowType,
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

export async function listUserConnectionsWithSettings(db: Database, userId: string) {
  const connections = await db
    .select()
    .from(projectGithubConnection)
    .where(eq(projectGithubConnection.userId, userId));

  const settings = await db
    .select()
    .from(workflowSetting)
    .where(eq(workflowSetting.userId, userId));

  const settingsByConnection = new Map<string, Map<string, boolean>>();
  for (const row of settings) {
    if (!settingsByConnection.has(row.projectGithubConnectionId)) {
      settingsByConnection.set(row.projectGithubConnectionId, new Map());
    }
    settingsByConnection.get(row.projectGithubConnectionId)!.set(row.workflowType, row.enabled);
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

export async function upsertWorkflowSetting(
  db: Database,
  userId: string,
  connectionId: string,
  workflowType: WorkflowType,
  enabled: boolean,
) {
  const existing = await db
    .select({ id: workflowSetting.id })
    .from(workflowSetting)
    .where(
      and(
        eq(workflowSetting.userId, userId),
        eq(workflowSetting.projectGithubConnectionId, connectionId),
        eq(workflowSetting.workflowType, workflowType),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(workflowSetting)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(workflowSetting.id, existing[0].id));
    return;
  }

  await db.insert(workflowSetting).values({
    id: randomUUID(),
    userId,
    projectGithubConnectionId: connectionId,
    workflowType,
    enabled,
  });
}

export async function listUserWorkflowInstances(db: Database, userId: string) {
  const rows = await db
    .select({
      settingId: workflowSetting.id,
      connectionId: workflowSetting.projectGithubConnectionId,
      workflowType: workflowSetting.workflowType,
      projectPath: projectGithubConnection.projectPath,
      owner: projectGithubConnection.githubOwner,
      repo: projectGithubConnection.githubRepo,
    })
    .from(workflowSetting)
    .innerJoin(
      projectGithubConnection,
      eq(workflowSetting.projectGithubConnectionId, projectGithubConnection.id),
    )
    .where(and(eq(workflowSetting.userId, userId), eq(workflowSetting.enabled, true)));

  const templates = new Map(DEFAULT_WORKFLOW_DEFINITIONS.map((item) => [item.type, item]));

  return rows.map((row) => {
    const template = templates.get(row.workflowType as WorkflowType);
    return {
      id: row.settingId,
      connectionId: row.connectionId,
      type: row.workflowType as WorkflowType,
      title: template?.title ?? row.workflowType,
      description: template?.description ?? "",
      fullName: `${row.owner}/${row.repo}`,
      owner: row.owner,
      repo: row.repo,
      projectPath: row.projectPath,
    };
  });
}
