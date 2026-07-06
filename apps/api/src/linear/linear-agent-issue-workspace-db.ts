import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, lt, ne, type Database } from "@openharness/db";
import {
  linearAgentIssueWorkspace,
  linearAgentRun,
  type LinearAgentIssueWorkspaceStatus,
} from "@openharness/db/schema";
import { Result } from "better-result";
import { InfrastructureError, IssueWorkspaceClaimError } from "../errors.js";
import { issueSandboxName } from "../cloud-worker/sandbox-names.js";
import { stopIssueWorkspaceSandboxBestEffort } from "../cloud-worker/stop-sandbox.js";
import { env } from "../env.js";
import { LINEAR_AGENT_RUN_STALE_AFTER_MS } from "./linear-agent-db.js";

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
): Promise<Result<LinearAgentIssueWorkspaceRecord, InfrastructureError>> {
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
    expiresAt: null,
  });
  const rows = await db
    .select()
    .from(linearAgentIssueWorkspace)
    .where(eq(linearAgentIssueWorkspace.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return Result.err(
      new InfrastructureError({
        operation: "createLinearAgentIssueWorkspace",
        cause: "workspace not found after insert",
      }),
    );
  }
  return Result.ok(mapWorkspace(row));
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
  Result<
    { workspace: LinearAgentIssueWorkspaceRecord; mode: "reuse" | "create" },
    IssueWorkspaceClaimError | InfrastructureError
  >
> {
  if (
    await hasActiveLinearAgentRunForIssue(db, input.organizationId, input.linearIssueId, {
      excludeRunId: input.runId,
    })
  ) {
    return Result.err(new IssueWorkspaceClaimError({ reason: "active_run" }));
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
    await stopIssueWorkspaceSandboxBestEffort(existing.sandboxName, {
      linearIssueId: input.linearIssueId,
      reason: "claim_reset",
    });
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
    const workspaceResult = await createLinearAgentIssueWorkspace(db, input);
    if (Result.isError(workspaceResult)) return workspaceResult;
    return Result.ok({ workspace: workspaceResult.value, mode: "create" });
  }

  if (!isIssueWorkspaceCompatible(workspaceAfterReset, input)) {
    return Result.err(new IssueWorkspaceClaimError({ reason: "incompatible" }));
  }

  if (isIssueWorkspaceExpired(workspaceAfterReset)) {
    return Result.err(new IssueWorkspaceClaimError({ reason: "expired" }));
  }

  if (workspaceAfterReset.status === "busy") {
    return Result.err(new IssueWorkspaceClaimError({ reason: "busy" }));
  }

  const rows = await db
    .update(linearAgentIssueWorkspace)
    .set({
      status: "busy",
      sandboxName: input.sandboxName,
      expiresAt: null,
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
    return Result.err(new IssueWorkspaceClaimError({ reason: "busy" }));
  }

  return Result.ok({ workspace: mapWorkspace(rows[0]), mode: "reuse" });
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
  const existing = await getLinearAgentIssueWorkspace(db, organizationId, linearIssueId);
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
  if (existing?.sandboxName) {
    await stopIssueWorkspaceSandboxBestEffort(existing.sandboxName, {
      linearIssueId,
      reason: "invalidate",
    });
  }
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
        inArray(linearAgentIssueWorkspace.status, ["ready", "stopped"]),
        isNotNull(linearAgentIssueWorkspace.expiresAt),
        lt(linearAgentIssueWorkspace.expiresAt, now),
      ),
    )
    .limit(100);
  return rows.map(mapWorkspace);
}

/** Workspaces marked expired (e.g. resume/create failure) that may still have a running VM. */
export async function listInvalidatedIssueWorkspaces(
  db: Database,
): Promise<LinearAgentIssueWorkspaceRecord[]> {
  const rows = await db
    .select()
    .from(linearAgentIssueWorkspace)
    .where(eq(linearAgentIssueWorkspace.status, "expired"))
    .limit(100);
  return rows.map(mapWorkspace);
}

/**
 * Busy workspaces whose run finished without releasing, or whose active run is stale.
 * Orphaned busy (no active run) is reclaimed immediately; stale busy is handled via run interrupt.
 */
export async function listStuckBusyIssueWorkspaces(
  db: Database,
  staleBefore: Date = new Date(Date.now() - LINEAR_AGENT_RUN_STALE_AFTER_MS),
): Promise<LinearAgentIssueWorkspaceRecord[]> {
  const rows = await db
    .select()
    .from(linearAgentIssueWorkspace)
    .where(eq(linearAgentIssueWorkspace.status, "busy"))
    .limit(100);

  const stuck: LinearAgentIssueWorkspaceRecord[] = [];
  for (const row of rows) {
    const workspace = mapWorkspace(row);
    const hasActiveRun = await hasActiveLinearAgentRunForIssue(
      db,
      workspace.organizationId,
      workspace.linearIssueId,
    );
    if (!hasActiveRun) {
      stuck.push(workspace);
      continue;
    }
    if (new Date(workspace.updatedAt).getTime() <= staleBefore.getTime()) {
      stuck.push(workspace);
    }
  }
  return stuck;
}

export async function releaseOrphanedBusyIssueWorkspace(
  db: Database,
  workspace: LinearAgentIssueWorkspaceRecord,
): Promise<boolean> {
  const hasActiveRun = await hasActiveLinearAgentRunForIssue(
    db,
    workspace.organizationId,
    workspace.linearIssueId,
  );
  if (hasActiveRun) {
    return false;
  }

  await releaseIssueWorkspaceAfterRun(db, {
    organizationId: workspace.organizationId,
    linearIssueId: workspace.linearIssueId,
    runId: workspace.lastCompletedRunId ?? "reaper",
    success: false,
  });
  return true;
}

export async function deleteIssueWorkspaceById(db: Database, workspaceId: string): Promise<void> {
  await db.delete(linearAgentIssueWorkspace).where(eq(linearAgentIssueWorkspace.id, workspaceId));
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

export function inferLinearAgentWorkspaceModeFromRecord(
  linearIssueId: string | null,
  workspace: LinearAgentIssueWorkspaceRecord | null,
  input: {
    projectSourceControlConnectionId: string | null;
    bundleFingerprint: string | null;
  },
): "cold" | "create" | "reuse" {
  if (!linearIssueId?.trim()) return "cold";
  if (!workspace) return "create";

  if (
    input.projectSourceControlConnectionId &&
    input.bundleFingerprint &&
    !isIssueWorkspaceCompatible(workspace, {
      projectSourceControlConnectionId: input.projectSourceControlConnectionId,
      bundleFingerprint: input.bundleFingerprint,
    })
  ) {
    return "create";
  }

  if (
    input.projectSourceControlConnectionId &&
    workspace.projectSourceControlConnectionId !== input.projectSourceControlConnectionId
  ) {
    return "create";
  }

  if (workspace.status === "expired" || isIssueWorkspaceExpired(workspace)) {
    return "create";
  }

  if (workspace.status === "busy") {
    return "cold";
  }

  if (workspace.status === "ready" || workspace.status === "stopped") {
    return "reuse";
  }

  return "create";
}

export async function buildLinearAgentRunWorkspaceContext(
  db: Database,
  organizationId: string,
  run: {
    id: string;
    linearIssueId: string | null;
    runnerKind: string | null;
    projectSourceControlConnectionId?: string | null;
  },
  options?: { workspaceModeEnv?: string | null },
): Promise<LinearAgentRunWorkspaceContext> {
  const envMode = options?.workspaceModeEnv?.trim();
  const linearIssueId = run.linearIssueId?.trim() || null;
  const workspace =
    linearIssueId != null
      ? await getLinearAgentIssueWorkspace(db, organizationId, linearIssueId)
      : null;

  let mode: LinearAgentRunWorkspaceContext["mode"];
  if (envMode === "create" || envMode === "reuse" || envMode === "cold") {
    mode = envMode;
  } else {
    const { cloudWorkerBundleFingerprint } = await import("../cloud-worker/sandbox-dispatch-env.js");
    mode = inferLinearAgentWorkspaceModeFromRecord(linearIssueId, workspace, {
      projectSourceControlConnectionId: run.projectSourceControlConnectionId?.trim() || null,
      bundleFingerprint: cloudWorkerBundleFingerprint(),
    });
  }

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
