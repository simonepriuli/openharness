import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql, type Database } from "@openharness/db";
import {
  projectGithubConnection,
  runnerRepoBinding,
} from "@openharness/db/schema";

export type RunnerBindingRecord = {
  id: string;
  organizationId: string;
  userId: string;
  runnerInstanceId: string;
  connectionId: string;
  projectPath: string;
  label: string | null;
  lastSeenAt: string | null;
  owner: string;
  repo: string;
  fullName: string;
  createdAt: string;
  updatedAt: string;
};

export type OrgRepoConnectionRecord = {
  id: string;
  organizationId: string;
  userId: string;
  githubOwner: string;
  githubRepo: string;
  githubRepoId: string;
  installationId: string;
  remoteUrl: string | null;
  fullName: string;
  createdAt: string;
  updatedAt: string;
};

function mapBindingRow(row: {
  id: string;
  organizationId: string;
  userId: string;
  runnerInstanceId: string;
  connectionId: string;
  projectPath: string;
  label: string | null;
  lastSeenAt: Date | null;
  owner: string;
  repo: string;
  createdAt: Date;
  updatedAt: Date;
}): RunnerBindingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    runnerInstanceId: row.runnerInstanceId,
    connectionId: row.connectionId,
    projectPath: row.projectPath,
    label: row.label,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    owner: row.owner,
    repo: row.repo,
    fullName: `${row.owner}/${row.repo}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listOrgRepoConnections(
  db: Database,
  organizationId: string,
): Promise<OrgRepoConnectionRecord[]> {
  const rows = await db
    .select()
    .from(projectGithubConnection)
    .where(eq(projectGithubConnection.organizationId, organizationId))
    .orderBy(desc(projectGithubConnection.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    githubOwner: row.githubOwner,
    githubRepo: row.githubRepo,
    githubRepoId: row.githubRepoId,
    installationId: row.installationId,
    remoteUrl: row.remoteUrl,
    fullName: `${row.githubOwner}/${row.githubRepo}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getOrgRepoConnection(
  db: Database,
  organizationId: string,
  installationId: string,
  owner: string,
  repo: string,
) {
  const rows = await db
    .select()
    .from(projectGithubConnection)
    .where(
      and(
        eq(projectGithubConnection.organizationId, organizationId),
        eq(projectGithubConnection.installationId, installationId),
        sql`lower(${projectGithubConnection.githubOwner}) = ${owner.toLowerCase()}`,
        sql`lower(${projectGithubConnection.githubRepo}) = ${repo.toLowerCase()}`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertOrgRepoConnection(
  db: Database,
  organizationId: string,
  userId: string,
  input: {
    owner: string;
    repo: string;
    githubRepoId: string;
    installationId: string;
    remoteUrl: string | null;
  },
): Promise<string> {
  const existing = await getOrgRepoConnection(
    db,
    organizationId,
    input.installationId,
    input.owner,
    input.repo,
  );

  if (existing) {
    await db
      .update(projectGithubConnection)
      .set({
        githubOwner: input.owner,
        githubRepo: input.repo,
        githubRepoId: input.githubRepoId,
        remoteUrl: input.remoteUrl,
        updatedAt: new Date(),
      })
      .where(eq(projectGithubConnection.id, existing.id));
    return existing.id;
  }

  const connectionId = randomUUID();
  await db.insert(projectGithubConnection).values({
    id: connectionId,
    organizationId,
    userId,
    githubOwner: input.owner,
    githubRepo: input.repo,
    githubRepoId: input.githubRepoId,
    installationId: input.installationId,
    remoteUrl: input.remoteUrl,
  });
  return connectionId;
}

export async function deleteOrgRepoConnectionIfOrphaned(
  db: Database,
  organizationId: string,
  connectionId: string,
): Promise<boolean> {
  const bindings = await db
    .select({ id: runnerRepoBinding.id })
    .from(runnerRepoBinding)
    .where(eq(runnerRepoBinding.projectGithubConnectionId, connectionId))
    .limit(1);

  if (bindings[0]) return false;

  await db
    .delete(projectGithubConnection)
    .where(
      and(
        eq(projectGithubConnection.id, connectionId),
        eq(projectGithubConnection.organizationId, organizationId),
      ),
    );
  return true;
}

export async function listRunnerBindings(
  db: Database,
  organizationId: string,
  options?: { runnerInstanceId?: string; userId?: string },
): Promise<RunnerBindingRecord[]> {
  const conditions = [eq(runnerRepoBinding.organizationId, organizationId)];
  if (options?.runnerInstanceId) {
    conditions.push(eq(runnerRepoBinding.runnerInstanceId, options.runnerInstanceId));
  }
  if (options?.userId) {
    conditions.push(eq(runnerRepoBinding.userId, options.userId));
  }

  const rows = await db
    .select({
      id: runnerRepoBinding.id,
      organizationId: runnerRepoBinding.organizationId,
      userId: runnerRepoBinding.userId,
      runnerInstanceId: runnerRepoBinding.runnerInstanceId,
      connectionId: runnerRepoBinding.projectGithubConnectionId,
      projectPath: runnerRepoBinding.projectPath,
      label: runnerRepoBinding.label,
      lastSeenAt: runnerRepoBinding.lastSeenAt,
      owner: projectGithubConnection.githubOwner,
      repo: projectGithubConnection.githubRepo,
      createdAt: runnerRepoBinding.createdAt,
      updatedAt: runnerRepoBinding.updatedAt,
    })
    .from(runnerRepoBinding)
    .innerJoin(
      projectGithubConnection,
      eq(runnerRepoBinding.projectGithubConnectionId, projectGithubConnection.id),
    )
    .where(and(...conditions))
    .orderBy(desc(runnerRepoBinding.updatedAt));

  return rows.map(mapBindingRow);
}

export async function getRunnerBindingByPath(
  db: Database,
  organizationId: string,
  runnerInstanceId: string,
  projectPath: string,
) {
  const rows = await db
    .select({
      binding: runnerRepoBinding,
      owner: projectGithubConnection.githubOwner,
      repo: projectGithubConnection.githubRepo,
      githubRepoId: projectGithubConnection.githubRepoId,
      installationId: projectGithubConnection.installationId,
      remoteUrl: projectGithubConnection.remoteUrl,
    })
    .from(runnerRepoBinding)
    .innerJoin(
      projectGithubConnection,
      eq(runnerRepoBinding.projectGithubConnectionId, projectGithubConnection.id),
    )
    .where(
      and(
        eq(runnerRepoBinding.organizationId, organizationId),
        eq(runnerRepoBinding.runnerInstanceId, runnerInstanceId),
        eq(runnerRepoBinding.projectPath, projectPath),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getRunnerBindingForConnection(
  db: Database,
  runnerInstanceId: string,
  connectionId: string,
) {
  const rows = await db
    .select()
    .from(runnerRepoBinding)
    .where(
      and(
        eq(runnerRepoBinding.runnerInstanceId, runnerInstanceId),
        eq(runnerRepoBinding.projectGithubConnectionId, connectionId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertRunnerBinding(
  db: Database,
  organizationId: string,
  userId: string,
  input: {
    runnerInstanceId: string;
    connectionId: string;
    projectPath: string;
    label?: string | null;
  },
): Promise<RunnerBindingRecord> {
  const existing = await getRunnerBindingForConnection(
    db,
    input.runnerInstanceId,
    input.connectionId,
  );
  const now = new Date();

  if (existing) {
    await db
      .update(runnerRepoBinding)
      .set({
        projectPath: input.projectPath,
        label: input.label ?? existing.label,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(runnerRepoBinding.id, existing.id));
  } else {
    await db.insert(runnerRepoBinding).values({
      id: randomUUID(),
      organizationId,
      userId,
      runnerInstanceId: input.runnerInstanceId,
      projectGithubConnectionId: input.connectionId,
      projectPath: input.projectPath,
      label: input.label ?? null,
      lastSeenAt: now,
    });
  }

  const bindings = await listRunnerBindings(db, organizationId, {
    runnerInstanceId: input.runnerInstanceId,
  });
  const match = bindings.find((row) => row.connectionId === input.connectionId);
  if (!match) {
    throw new Error("Failed to load runner binding after upsert");
  }
  return match;
}

export async function deleteRunnerBinding(
  db: Database,
  organizationId: string,
  bindingId: string,
): Promise<{ deleted: boolean; connectionId: string | null }> {
  const rows = await db
    .select()
    .from(runnerRepoBinding)
    .where(
      and(
        eq(runnerRepoBinding.id, bindingId),
        eq(runnerRepoBinding.organizationId, organizationId),
      ),
    )
    .limit(1);

  const binding = rows[0];
  if (!binding) return { deleted: false, connectionId: null };

  await db.delete(runnerRepoBinding).where(eq(runnerRepoBinding.id, bindingId));
  return { deleted: true, connectionId: binding.projectGithubConnectionId };
}

export async function deleteRunnerBindingByPath(
  db: Database,
  organizationId: string,
  runnerInstanceId: string,
  projectPath: string,
): Promise<{ deleted: boolean; connectionId: string | null }> {
  const row = await getRunnerBindingByPath(db, organizationId, runnerInstanceId, projectPath);
  if (!row) return { deleted: false, connectionId: null };

  await db.delete(runnerRepoBinding).where(eq(runnerRepoBinding.id, row.binding.id));
  return { deleted: true, connectionId: row.binding.projectGithubConnectionId };
}

export async function heartbeatRunnerBindings(
  db: Database,
  organizationId: string,
  runnerInstanceId: string,
  options?: { label?: string | null },
): Promise<void> {
  const now = new Date();
  await db
    .update(runnerRepoBinding)
    .set({
      lastSeenAt: now,
      updatedAt: now,
      ...(options?.label !== undefined ? { label: options.label } : {}),
    })
    .where(
      and(
        eq(runnerRepoBinding.organizationId, organizationId),
        eq(runnerRepoBinding.runnerInstanceId, runnerInstanceId),
      ),
    );
}

export async function listBoundConnectionIdsForRunner(
  db: Database,
  organizationId: string,
  runnerInstanceId: string,
): Promise<string[]> {
  const rows = await db
    .select({ connectionId: runnerRepoBinding.projectGithubConnectionId })
    .from(runnerRepoBinding)
    .where(
      and(
        eq(runnerRepoBinding.organizationId, organizationId),
        eq(runnerRepoBinding.runnerInstanceId, runnerInstanceId),
      ),
    );
  return rows.map((row) => row.connectionId);
}
