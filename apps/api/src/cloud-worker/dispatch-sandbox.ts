import type { Database } from "@openharness/db";
import { Sandbox } from "@vercel/sandbox";
import { env } from "../env.js";
import { updateWorkflowRunStatus } from "../github/workflow-db.js";
import {
  SANDBOX_BUNDLE_ROOT,
  SANDBOX_INITIAL_TIMEOUT_MS,
  isSandboxDispatchEnabled,
} from "./sandbox-dispatch-env.js";

export type DispatchCloudWorkflowRunResult =
  | { ok: true; sandboxId: string }
  | { ok: false; error: string };

function sandboxWorkerId(runId: string): string {
  return `sandbox-${runId}`;
}

export async function dispatchCloudWorkflowRun(input: {
  runId: string;
  organizationId: string;
}): Promise<DispatchCloudWorkflowRunResult> {
  const snapshotId = env.cloudWorkerSnapshotId();
  const secret = env.cloudWorkerSecret();
  if (!snapshotId || !secret) {
    return { ok: false, error: "Cloud worker snapshot or secret is not configured" };
  }

  try {
    const sandbox = await Sandbox.create({
      source: { type: "snapshot", snapshotId },
      timeout: SANDBOX_INITIAL_TIMEOUT_MS,
    });

    const workerEnv = {
      OPENHARNESS_API_URL: env.betterAuthUrl(),
      CLOUD_WORKER_SECRET: secret,
      OPENHARNESS_ROOT: SANDBOX_BUNDLE_ROOT,
      OPENHARNESS_REPOS_ROOT: "/tmp/openharness/repos",
      OPENHARNESS_WORKTREES_ROOT: "/tmp/openharness/worktrees",
      OPENHARNESS_PI_AGENT_ROOT: "/tmp/openharness/pi",
      CLOUD_WORKER_ID: sandboxWorkerId(input.runId),
      RUN_ID: input.runId,
      ORGANIZATION_ID: input.organizationId,
      VERCEL_SANDBOX_ID: sandbox.sandboxId,
    };

    await sandbox.runCommand({
      cmd: "node",
      args: [
        "cloud-worker/dist/index.js",
        "run-once",
        "--run-id",
        input.runId,
        "--organization-id",
        input.organizationId,
      ],
      cwd: SANDBOX_BUNDLE_ROOT,
      env: workerEnv,
      detached: true,
    });

    console.log("[cloud-worker/dispatch] started sandbox run", {
      runId: input.runId,
      organizationId: input.organizationId,
      sandboxId: sandbox.sandboxId,
    });

    return { ok: true, sandboxId: sandbox.sandboxId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cloud-worker/dispatch] failed", input.runId, message);
    return { ok: false, error: message };
  }
}

// text 
export async function maybeDispatchCloudWorkflowRun(
  db: Database,
  input: { runId: string; organizationId: string },
): Promise<void> {
  if (!isSandboxDispatchEnabled()) {
    return;
  }

  const result = await dispatchCloudWorkflowRun(input);
  if (!result.ok) {
    await updateWorkflowRunStatus(db, input.runId, input.organizationId, "failed", {
      errorMessage: `Cloud sandbox dispatch failed: ${result.error}`,
    });
  }
}
