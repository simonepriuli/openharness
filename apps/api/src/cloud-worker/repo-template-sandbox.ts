import type { Database } from "@openharness/db";
import type { SourceControlProvider } from "@openharness/db/schema";
import type { Sandbox } from "@vercel/sandbox";
import { Result } from "better-result";
import { dirname, join } from "node:path";
import { SandboxError } from "../errors.js";
import { getCloudWorkerOrgContext } from "../org/org-db.js";
import { getSourceControlProvider } from "../source-control/registry.js";
import type { GitCredentials } from "../source-control/pr-context.js";
import {
  createSnapshotSandbox,
  forkSandbox,
  getOrCreateSandbox,
  getSandboxByName,
  stopSandbox,
} from "./sandbox-client.js";
import { runSandboxName, templateSandboxName } from "./sandbox-names.js";
import { SANDBOX_REPOS_ROOT, cloudWorkerBundleFingerprint } from "./sandbox-dispatch-env.js";

export type RepoTemplateCacheStatus = "hit" | "created";

export { runSandboxName, templateSandboxName };

export function buildAuthenticatedRemoteUrl(
  remoteUrl: string,
  username: string,
  token: string,
): string {
  return remoteUrl.replace(
    /^https:\/\//,
    `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@`,
  );
}

export function repoDirForConnection(
  organizationId: string,
  projectSourceControlConnectionId: string,
): string {
  return join(SANDBOX_REPOS_ROOT, organizationId, projectSourceControlConnectionId);
}

async function fetchCloudWorkerGitCredentials(
  db: Database,
  organizationId: string,
  provider: SourceControlProvider,
  namespace: string,
  repoName: string,
): Promise<GitCredentials> {
  const org = await getCloudWorkerOrgContext(db, organizationId);
  if (!org) {
    throw new Error("Organization not found or cloud workers disabled");
  }

  const adapter = getSourceControlProvider(provider);
  return adapter.fetchGitCredentials(org.id, namespace, repoName);
}

async function cloneRepoInTemplate(
  sandbox: Sandbox,
  input: {
    organizationId: string;
    projectSourceControlConnectionId: string;
    credentials: GitCredentials;
  },
): Promise<void> {
  const repoDir = repoDirForConnection(
    input.organizationId,
    input.projectSourceControlConnectionId,
  );
  const parentDir = dirname(repoDir);
  const repoFolder = input.projectSourceControlConnectionId;
  const authUrl = buildAuthenticatedRemoteUrl(
    input.credentials.remoteUrl,
    input.credentials.username,
    input.credentials.token,
  );

  await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `rm -rf ${JSON.stringify(repoDir)} && mkdir -p ${JSON.stringify(parentDir)}`],
  });

  const clone = await sandbox.runCommand({
    cmd: "git",
    args: ["clone", "--depth", "1", authUrl, repoFolder],
    cwd: parentDir,
  });
  if (clone.exitCode !== 0) {
    const stderr = await clone.stderr();
    throw new Error(`Template repo clone failed (exit ${clone.exitCode}): ${stderr}`);
  }

  const verify = await sandbox.runCommand({
    cmd: "git",
    args: ["rev-parse", "HEAD"],
    cwd: repoDir,
  });
  if (verify.exitCode !== 0) {
    const stderr = await verify.stderr();
    throw new Error(`Template repo verification failed: ${stderr}`);
  }
}

async function tryGetNamedSandbox(templateName: string): Promise<Sandbox | null> {
  try {
    return await getSandboxByName(templateName, { resume: false });
  } catch {
    return null;
  }
}

export async function ensureRepoTemplateSandbox(input: {
  db: Database;
  organizationId: string;
  projectSourceControlConnectionId: string;
  provider: SourceControlProvider;
  namespace: string;
  repoName: string;
  bundleSnapshotId: string;
}): Promise<
  Result<{ templateName: string; cacheStatus: RepoTemplateCacheStatus }, SandboxError>
> {
  const bundleFingerprint = cloudWorkerBundleFingerprint();
  if (!bundleFingerprint) {
    return Result.err(
      new SandboxError({ message: "Cloud worker bundle fingerprint is not in sync" }),
    );
  }

  const templateName = templateSandboxName(
    input.organizationId,
    input.projectSourceControlConnectionId,
    bundleFingerprint,
  );

  const existing = await tryGetNamedSandbox(templateName);
  if (existing) {
    await stopSandbox(existing);
    return Result.ok({ templateName, cacheStatus: "hit" });
  }

  const credentialsResult = await Result.tryPromise({
    try: () =>
      fetchCloudWorkerGitCredentials(
        input.db,
        input.organizationId,
        input.provider,
        input.namespace,
        input.repoName,
      ),
    catch: (cause) =>
      new SandboxError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });
  if (Result.isError(credentialsResult)) {
    return Result.err(credentialsResult.error);
  }

  return Result.tryPromise({
    try: async () => {
      const template = await getOrCreateSandbox({
        name: templateName,
        source: { type: "snapshot", snapshotId: input.bundleSnapshotId },
        persistent: true,
        onCreate: async (sandbox) => {
          await cloneRepoInTemplate(sandbox, {
            organizationId: input.organizationId,
            projectSourceControlConnectionId: input.projectSourceControlConnectionId,
            credentials: credentialsResult.value,
          });
        },
      });

      await stopSandbox(template);
      return { templateName, cacheStatus: "created" as const };
    },
    catch: (cause) =>
      new SandboxError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });
}

export async function forkRunSandbox(input: {
  templateName: string;
  runId: string;
  env: Record<string, string>;
  timeout?: number;
  persistent?: boolean;
  sandboxName?: string;
}): Promise<Sandbox> {
  return forkSandbox(input);
}

export async function createBundleSnapshotSandbox(input: {
  bundleSnapshotId: string;
  runId?: string;
  timeout?: number;
}): Promise<Sandbox> {
  return createSnapshotSandbox(input);
}
