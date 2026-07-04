import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt, ne, type Database } from "@openharness/db";
import {
  linearAgentIssueWorkspace,
  linearAgentRun,
  type LinearAgentIssueWorkspaceStatus,
} from "@openharness/db/schema";
import { issueSandboxName } from "../cloud-worker/sandbox-names.js";
import { env } from "../env.js";

export { issueSandboxName };

export function linearAgentIssueWorkspaceIdleTtlMs(): number {
  return env.linearAgentIssueWorkspaceIdleTtlMs();
}

/** @deprecated Use linearAgentIssueWorkspaceIdleTtlMs() for env-aware TTL. */
export const LINEAR_AGENT_ISSUE_WORKSPACE_IDLE_TTL_MS = 45 * 60 * 1000;

export type LinearAgentIssueWorkspaceRecord = {
  id: string;
  organizationId: string;
  linearIssueId: string;
  projectSourceControlConnectionId: string;
  bundleFingerprint: string;
  sandboxName: string;
  status: LinearAgentIssueWorkspaceStatus;
  worktreePath: string | null;
  workBranch: string | null;
  piAgentDir: string | null;
  piSessionPath: string | null;
  lastCompletedRunId: string | null;
  lastActiveAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapWorkspace(
  row: typeof linearAgentIssueWorkspace.$inferSelect,
): LinearAgentIssueWorkspaceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    linearIssueId: row.linearIssueId,
    projectSourceControlConnectionId: row.projectSourceControlConnectionId,
    bundleFingerprint: row.bundleFingerprint,
    sandboxName: row.sandboxName,
    status: row.status as LinearAgentIssueWorkspaceStatus,
    worktreePath: row.worktreePath,
    workBranch: row.workBranch,
    piAgentDir: row.piAgentDir,
    piSessionPath: row.piSessionPath,
    lastCompletedRunId: row.lastCompletedRunId,
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function isIssueWorkspaceExpired(
  workspace: LinearAgentIssueWorkspaceRecord,
  nowMs: number = Date.now(),
): boolean {
  if (workspace.status === "expired") return true;
  if (!workspace.expiresAt) return false;
  return new Date(workspace.expiresAt).getTime() <= nowMs;
}

export function isIssueWorkspaceCompatible(
  workspace: LinearAgentIssueWorkspaceRecord,
  input: {
    projectSourceControlConnectionId: string;
    bundleFingerprint: string;
  },
): boolean {
  return (
    workspace.projectSourceControlConnectionId === input.projectSourceControlConnectionId &&
    workspace.bundleFingerprint === input.bundleFingerprint
  );
}

export async function hasActiveLinearAgentRunForIssue(
  db: Database,
  organizationId: string,
  linearIssueId: string,
  options?: { excludeRunId?: string },
): Promise<boolean> {
  const conditions = [
    eq(linearAgentRun.organizationId, organizationId),
    eq(linearAgentRun.linearIssueId, linearIssueId),
    inArray(linearAgentRun.status, ["pending", "claimed", "running"]),
  ];
  if (options?.excludeRunId) {
    conditions.push(ne(linearAgentRun.id, options.excludeRunId));
  }

  const rows = await db
    .select({ id: linearAgentRun.id })
    .from(linearAgentRun)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

export async function getLinearAgentIssueWorkspace(
  db: Database,
  organizationId: string,
  linearIssueId: string,
): Promise<LinearAgentIssueWorkspaceRecord | null> {
  const rows = await db
    .select()
    .from(linearAgentIssueWorkspace)
    .where(
      and(
        eq(linearAgentIssueWorkspace.organizationId, organizationId),
        eq(linearAgentIssueWorkspace.linearIssueId, linearIssueId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? mapWorkspace(row) : null;
}

export async function createLinearAgentIssueWorkspace(
  db: Database,
  input: {
    organizationId: string;
    linearIssueId: string;
    projectSourceControlConnectionId: string;
    bundleFingerprint: string;
    sandboxName: string;
    runId: string;
  },
): Promise<LinearAgentIssueWorkspaceRecord> {
  const now = new Date();
  const id = randomUUID();
  await db.insert(linearAgentIssueWorkspace).values({
    id,
    organizationId: input.organizationId,
    linearIssueId: input.linearIssueId,
    projectSourceControlConnectionId: input.projectSourceControlConnectionId,
    bundleFingerprint: input.bundleFingerprint,
    sandboxName: input.sandboxName,
    status: "busy",
    lastCompletedRunId: null,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + linearAgentIssueWorkspaceIdleTtlMs()),
  });
  const rows = await db
    .select()
    .from(linearAgentIssueWorkspace)
    .where(eq(linearAgentIssueWorkspace.id, id))
    .limit(1);
  return mapWorkspace(rows[0]!);
}

export async function claimIssueWorkspaceForRun(
  db: Database,
  input: {
    organizationId: string;
    linearIssueId: string;
    runId: string;
    projectSourceControlConnectionId: string;
    bundleFingerprint: string;
    sandboxName: string;
  },
): Promise<
  | { ok: true; workspace: LinearAgentIssueWorkspaceRecord; mode: "reuse" | "create" }
  | { ok: false; reason: "active_run" | "busy" | "incompatible" | "expired" }
> {
  if (
    await hasActiveLinearAgentRunForIssue(db, input.organizationId, input.linearIssueId, {
      excludeRunId: input.runId,
    })
  ) {
    return { ok: false, reason: "active_run" };
  }

  const existing = await getLinearAgentIssueWorkspace(
    db,
    input.organizationId,
    input.linearIssueId,
  );

  if (
    existing &&
    (existing.status === "expired" ||
      isIssueWorkspaceExpired(existing) ||
      !isIssueWorkspaceCompatible(existing, input))
  ) {
    await db
      .delete(linearAgentIssueWorkspace)
      .where(eq(linearAgentIssueWorkspace.id, existing.id));
  }

  const workspaceAfterReset = await getLinearAgentIssueWorkspace(
    db,
    input.organizationId,
    input.linearIssueId,
  );

  if (!workspaceAfterReset) {
    const workspace = await createLinearAgentIssueWorkspace(db, input);
    return { ok: true, workspace, mode: "create" };
  }

  if (!isIssueWorkspaceCompatible(workspaceAfterReset, input)) {
    return { ok: false, reason: "incompatible" };
  }

  if (isIssueWorkspaceExpired(workspaceAfterReset)) {
    return { ok: false, reason: "expired" };
  }

  if (workspaceAfterReset.status === "busy") {
    return { ok: false, reason: "busy" };
  }

  const rows = await db
    .update(linearAgentIssueWorkspace)
    .set({
      status: "busy",
      sandboxName: input.sandboxName,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(linearAgentIssueWorkspace.id, workspaceAfterReset.id),
        inArray(linearAgentIssueWorkspace.status, ["ready", "stopped"]),
      ),
    )
    .returning();

  if (!rows[0]) {
    return { ok: false, reason: "busy" };
  }

  return { ok: true, workspace: mapWorkspace(rows[0]), mode: "reuse" };
}

export async function releaseIssueWorkspaceAfterRun(
  db: Database,
  input: {
    organizationId: string;
    linearIssueId: string;
    runId: string;
    worktreePath?: string | null;
    workBranch?: string | null;
    piAgentDir?: string | null;
    piSessionPath?: string | null;
    success: boolean;
  },
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + linearAgentIssueWorkspaceIdleTtlMs());
  const patch: Partial<typeof linearAgentIssueWorkspace.$inferInsert> = {
    status: "ready",
    lastActiveAt: now,
    expiresAt,
    updatedAt: now,
  };
  if (input.worktreePath != null) patch.worktreePath = input.worktreePath;
  if (input.workBranch != null) patch.workBranch = input.workBranch;
  if (input.piAgentDir != null) patch.piAgentDir = input.piAgentDir;
  if (input.piSessionPath != null) patch.piSessionPath = input.piSessionPath;
  if (input.success) patch.lastCompletedRunId = input.runId;

  await db
    .update(linearAgentIssueWorkspace)
    .set(patch)
    .where(
      and(
        eq(linearAgentIssueWorkspace.organizationId, input.organizationId),
        eq(linearAgentIssueWorkspace.linearIssueId, input.linearIssueId),
        eq(linearAgentIssueWorkspace.status, "busy"),
      ),
    );
}

export async function invalidateIssueWorkspace(
  db: Database,
  organizationId: string,
  linearIssueId: string,
): Promise<LinearAgentIssueWorkspaceRecord | null> {
  const rows = await db
    .update(linearAgentIssueWorkspace)
    .set({
      status: "expired",
      worktreePath: null,
      workBranch: null,
      piAgentDir: null,
      piSessionPath: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(linearAgentIssueWorkspace.organizationId, organizationId),
        eq(linearAgentIssueWorkspace.linearIssueId, linearIssueId),
      ),
    )
    .returning();
  const row = rows[0];
  return row ? mapWorkspace(row) : null;
}

export async function markIssueWorkspaceStopped(
  db: Database,
  organizationId: string,
  linearIssueId: string,
): Promise<void> {
  await db
    .update(linearAgentIssueWorkspace)
    .set({ status: "stopped", updatedAt: new Date() })
    .where(
      and(
        eq(linearAgentIssueWorkspace.organizationId, organizationId),
        eq(linearAgentIssueWorkspace.linearIssueId, linearIssueId),
        inArray(linearAgentIssueWorkspace.status, ["ready", "busy"]),
      ),
    );
}

export async function listExpiredIssueWorkspaces(
  db: Database,
  now: Date = new Date(),
): Promise<LinearAgentIssueWorkspaceRecord[]> {
  const rows = await db
    .select()
    .from(linearAgentIssueWorkspace)
    .where(
      and(
        inArray(linearAgentIssueWorkspace.status, ["ready", "stopped", "busy"]),
        lt(linearAgentIssueWorkspace.expiresAt, now),
      ),
    )
    .limit(100);
  return rows.map(mapWorkspace);
}

export async function expireIssueWorkspacesPastIdleTtl(db: Database): Promise<number> {
  const expired = await listExpiredIssueWorkspaces(db);
  if (expired.length === 0) return 0;

  await db
    .update(linearAgentIssueWorkspace)
    .set({
      status: "expired",
      worktreePath: null,
      workBranch: null,
      piAgentDir: null,
      piSessionPath: null,
      updatedAt: new Date(),
    })
    .where(
      inArray(
        linearAgentIssueWorkspace.id,
        expired.map((workspace) => workspace.id),
      ),
    );

  return expired.length;
}

export async function updateLinearAgentRunRunnerKind(
  db: Database,
  runId: string,
  organizationId: string,
  runnerKind: string,
): Promise<void> {
  await db
    .update(linearAgentRun)
    .set({ runnerKind, updatedAt: new Date() })
    .where(and(eq(linearAgentRun.id, runId), eq(linearAgentRun.organizationId, organizationId)));
}

export type LinearAgentRunWorkspaceContext = {
  mode: "cold" | "create" | "reuse";
  linearIssueId: string | null;
  worktreePath: string | null;
  workBranch: string | null;
  piAgentDir: string | null;
  piSessionPath: string | null;
  retainSandbox: boolean;
};

export async function buildLinearAgentRunWorkspaceContext(
  db: Database,
  organizationId: string,
  run: {
    id: string;
    linearIssueId: string | null;
    runnerKind: string | null;
  },
  options?: { workspaceModeEnv?: string | null },
): Promise<LinearAgentRunWorkspaceContext> {
  const envMode = options?.workspaceModeEnv?.trim();
  const mode: LinearAgentRunWorkspaceContext["mode"] =
    envMode === "create" || envMode === "reuse" || envMode === "cold" ? envMode : "cold";
  const linearIssueId = run.linearIssueId?.trim() || null;
  const retainSandbox = mode === "create" || mode === "reuse";

  if (!linearIssueId || mode === "cold") {
    return {
      mode: "cold",
      linearIssueId,
      worktreePath: null,
      workBranch: null,
      piAgentDir: null,
      piSessionPath: null,
      retainSandbox: false,
    };
  }

  const workspace = await getLinearAgentIssueWorkspace(db, organizationId, linearIssueId);
  return {
    mode,
    linearIssueId,
    worktreePath: workspace?.worktreePath ?? null,
    workBranch: workspace?.workBranch ?? null,
    piAgentDir: workspace?.piAgentDir ?? null,
    piSessionPath: workspace?.piSessionPath ?? null,
    retainSandbox,
  };
}
