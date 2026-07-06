import { randomUUID } from "node:crypto";
import { and, desc, eq, sql, type Database } from "@openharness/db";
import { Result } from "better-result";
import { InfrastructureError } from "../errors.js";
import {
  projectSourceControlConnection,
  runnerRepoBinding,
  type SourceControlProvider,
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
  provider: SourceControlProvider;
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
  provider: SourceControlProvider;
  githubOwner: string;
  githubRepo: string;
  githubRepoId: string;
  installationId: string;
  connectionId: string;
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
  provider: SourceControlProvider;
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
    provider: row.provider,
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
  provider?: SourceControlProvider,
): Promise<OrgRepoConnectionRecord[]> {
  const conditions = [eq(projectSourceControlConnection.organizationId, organizationId)];
  if (provider) {
    conditions.push(eq(projectSourceControlConnection.provider, provider));
  }

  const rows = await db
    .select()
    .from(projectSourceControlConnection)
    .where(and(...conditions))
    .orderBy(desc(projectSourceControlConnection.updatedAt));

  return rows.map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, string>;
    return {
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      provider: row.provider,
      githubOwner: row.namespace,
      githubRepo: row.name,
      githubRepoId: row.externalRepoId,
      installationId: metadata.installationId ?? row.connectionId,
      connectionId: row.connectionId,
      remoteUrl: row.remoteUrl,
      fullName: `${row.namespace}/${row.name}`,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function getOrgRepoConnection(
  db: Database,
  organizationId: string,
  provider: SourceControlProvider,
  connectionId: string,
  namespace: string,
  name: string,
) {
  const rows = await db
    .select()
    .from(projectSourceControlConnection)
    .where(
      and(
        eq(projectSourceControlConnection.organizationId, organizationId),
        eq(projectSourceControlConnection.provider, provider),
        eq(projectSourceControlConnection.connectionId, connectionId),
        sql`lower(${projectSourceControlConnection.namespace}) = ${namespace.toLowerCase()}`,
        sql`lower(${projectSourceControlConnection.name}) = ${name.toLowerCase()}`,
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
    provider: SourceControlProvider;
    owner: string;
    repo: string;
    externalRepoId: string;
    githubRepoId?: string;
    connectionId: string;
    installationId?: string;
    remoteUrl: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  const existing = await getOrgRepoConnection(
    db,
    organizationId,
    input.provider,
    input.connectionId,
    input.owner,
    input.repo,
  );

  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.installationId ? { installationId: input.installationId } : {}),
  };

  if (existing) {
    await db
      .update(projectSourceControlConnection)
      .set({
        namespace: input.owner,
        name: input.repo,
        externalRepoId: input.externalRepoId,
        remoteUrl: input.remoteUrl,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(projectSourceControlConnection.id, existing.id));
    return existing.id;
  }

  const projectConnectionId = randomUUID();
  await db.insert(projectSourceControlConnection).values({
    id: projectConnectionId,
    organizationId,
    userId,
    connectionId: input.connectionId,
    provider: input.provider,
    namespace: input.owner,
    name: input.repo,
    externalRepoId: input.externalRepoId,
    remoteUrl: input.remoteUrl,
    metadata,
  });
  return projectConnectionId;
}

export async function deleteOrgRepoConnectionIfOrphaned(
  db: Database,
  organizationId: string,
  connectionId: string,
): Promise<boolean> {
  const bindings = await db
    .select({ id: runnerRepoBinding.id })
    .from(runnerRepoBinding)
    .where(eq(runnerRepoBinding.projectSourceControlConnectionId, connectionId))
    .limit(1);

  if (bindings[0]) return false;

  await db
    .delete(projectSourceControlConnection)
    .where(
      and(
        eq(projectSourceControlConnection.id, connectionId),
        eq(projectSourceControlConnection.organizationId, organizationId),
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
      connectionId: runnerRepoBinding.projectSourceControlConnectionId,
      projectPath: runnerRepoBinding.projectPath,
      label: runnerRepoBinding.label,
      lastSeenAt: runnerRepoBinding.lastSeenAt,
      provider: projectSourceControlConnection.provider,
      owner: projectSourceControlConnection.namespace,
      repo: projectSourceControlConnection.name,
      createdAt: runnerRepoBinding.createdAt,
      updatedAt: runnerRepoBinding.updatedAt,
    })
    .from(runnerRepoBinding)
    .innerJoin(
      projectSourceControlConnection,
      eq(
        runnerRepoBinding.projectSourceControlConnectionId,
        projectSourceControlConnection.id,
      ),
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
      provider: projectSourceControlConnection.provider,
      owner: projectSourceControlConnection.namespace,
      repo: projectSourceControlConnection.name,
      externalRepoId: projectSourceControlConnection.externalRepoId,
      sourceConnectionId: projectSourceControlConnection.connectionId,
      remoteUrl: projectSourceControlConnection.remoteUrl,
      metadata: projectSourceControlConnection.metadata,
    })
    .from(runnerRepoBinding)
    .innerJoin(
      projectSourceControlConnection,
      eq(
        runnerRepoBinding.projectSourceControlConnectionId,
        projectSourceControlConnection.id,
      ),
    )
    .where(
      and(
        eq(runnerRepoBinding.organizationId, organizationId),
        eq(runnerRepoBinding.runnerInstanceId, runnerInstanceId),
        eq(runnerRepoBinding.projectPath, projectPath),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const metadata = (row.metadata ?? {}) as Record<string, string>;
  return {
    binding: row.binding,
    provider: row.provider,
    owner: row.owner,
    repo: row.repo,
    githubRepoId: row.externalRepoId,
    externalRepoId: row.externalRepoId,
    installationId: metadata.installationId ?? row.sourceConnectionId,
    connectionId: row.sourceConnectionId,
    remoteUrl: row.remoteUrl,
  };
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
        eq(runnerRepoBinding.projectSourceControlConnectionId, connectionId),
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
): Promise<Result<RunnerBindingRecord, InfrastructureError>> {
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
      projectSourceControlConnectionId: input.connectionId,
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
    return Result.err(
      new InfrastructureError({
        operation: "upsertRunnerBinding",
        cause: "runner binding not found after upsert",
      }),
    );
  }
  return Result.ok(match);
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
  return { deleted: true, connectionId: binding.projectSourceControlConnectionId };
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
  return { deleted: true, connectionId: row.binding.projectSourceControlConnectionId };
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
    .select({ connectionId: runnerRepoBinding.projectSourceControlConnectionId })
    .from(runnerRepoBinding)
    .where(
      and(
        eq(runnerRepoBinding.organizationId, organizationId),
        eq(runnerRepoBinding.runnerInstanceId, runnerInstanceId),
      ),
    );
  return rows.map((row) => row.connectionId);
}

export async function getRunnerUserId(
  db: Database,
  organizationId: string,
  runnerInstanceId: string,
): Promise<string | null> {
  const rows = await db
    .select({ userId: runnerRepoBinding.userId })
    .from(runnerRepoBinding)
    .where(
      and(
        eq(runnerRepoBinding.organizationId, organizationId),
        eq(runnerRepoBinding.runnerInstanceId, runnerInstanceId),
      ),
    )
    .limit(1);
  return rows[0]?.userId ?? null;
}

export async function getProjectConnectionById(db: Database, connectionId: string) {
  const rows = await db
    .select()
    .from(projectSourceControlConnection)
    .where(eq(projectSourceControlConnection.id, connectionId))
    .limit(1);
  return rows[0] ?? null;
}
