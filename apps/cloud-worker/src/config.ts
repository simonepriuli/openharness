import { Result } from "better-result";
import { existsSync } from "node:fs";
import { ConfigError } from "./errors.js";

export type CloudWorkerConfig = {
  apiUrl: string;
  secret: string;
  workerId: string;
  sandboxName: string | null;
  reposRoot: string;
  worktreesRoot: string;
  openHarnessRoot: string | null;
  piAgentRoot: string;
  githubActionsExtensionDir: string;
  workflowNotifyExtensionDir: string;
  linearActionsExtensionDir: string;
  summarizationModelRef: string;
};

function requiredEnv(name: string): Result<string, ConfigError> {
  const value = process.env[name]?.trim();
  if (!value) {
    return Result.err(new ConfigError({ field: name }));
  }
  return Result.ok(value);
}

function defaultWorkerId(): string {
  const explicit = process.env.CLOUD_WORKER_ID?.trim();
  if (explicit) return explicit;
  return `${process.env.HOSTNAME ?? "cloud-worker"}-${process.pid}`;
}

/** Prefer IPv4 loopback — Node fetch can fail on localhost when only IPv4 is bound. */
function normalizeApiUrl(url: string): string {
  const parsed = Result.try({
    try: () => new URL(url),
    catch: () => null,
  });
  if (Result.isOk(parsed) && parsed.value.hostname === "localhost") {
    parsed.value.hostname = "127.0.0.1";
    return parsed.value.toString().replace(/\/$/, "");
  }
  if (Result.isOk(parsed)) {
    return parsed.value.toString().replace(/\/$/, "");
  }
  return url.replace(/\/$/, "");
}

function resolveGithubActionsExtensionDir(openHarnessRoot: string | null): string {
  if (openHarnessRoot) {
    const staged = `${openHarnessRoot}/extensions/github-actions`;
    if (existsSync(staged)) return staged;
    const devPath = `${openHarnessRoot}/apps/desktop/pi-extensions/github-actions`;
    if (existsSync(devPath)) return devPath;
  }
  return new URL("../../desktop/pi-extensions/github-actions", import.meta.url).pathname;
}

function resolveWorkflowNotifyExtensionDir(openHarnessRoot: string | null): string {
  if (openHarnessRoot) {
    const staged = `${openHarnessRoot}/extensions/workflow-notify`;
    if (existsSync(staged)) return staged;
    const devPath = `${openHarnessRoot}/apps/desktop/pi-extensions/workflow-notify`;
    if (existsSync(devPath)) return devPath;
  }
  return new URL("../../desktop/pi-extensions/workflow-notify", import.meta.url).pathname;
}

function resolveLinearActionsExtensionDir(openHarnessRoot: string | null): string {
  if (openHarnessRoot) {
    const staged = `${openHarnessRoot}/extensions/linear-actions`;
    if (existsSync(staged)) return staged;
    const devPath = `${openHarnessRoot}/apps/desktop/pi-extensions/linear-actions`;
    if (existsSync(devPath)) return devPath;
  }
  return new URL("../../desktop/pi-extensions/linear-actions", import.meta.url).pathname;
}

export function loadCloudWorkerConfig(): Result<CloudWorkerConfig, ConfigError> {
  const apiUrlFromEnv =
    process.env.OPENHARNESS_API_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  const apiUrlResult = apiUrlFromEnv
    ? Result.ok(apiUrlFromEnv)
    : requiredEnv("OPENHARNESS_API_URL");
  if (Result.isError(apiUrlResult)) return Result.err(apiUrlResult.error);

  const secretFromEnv = process.env.CLOUD_WORKER_SECRET?.trim();
  const secretResult = secretFromEnv
    ? Result.ok(secretFromEnv)
    : requiredEnv("CLOUD_WORKER_SECRET");
  if (Result.isError(secretResult)) return Result.err(secretResult.error);

  const openHarnessRoot = process.env.OPENHARNESS_ROOT?.trim() || null;

  return Result.ok({
    apiUrl: normalizeApiUrl(apiUrlResult.value),
    secret: secretResult.value,
    workerId: defaultWorkerId(),
    sandboxName:
      process.env.VERCEL_SANDBOX_NAME?.trim() ||
      process.env.VERCEL_SANDBOX_ID?.trim() ||
      null,
    reposRoot: process.env.OPENHARNESS_REPOS_ROOT?.trim() || "/tmp/openharness/repos",
    worktreesRoot: process.env.OPENHARNESS_WORKTREES_ROOT?.trim() || "/tmp/openharness/worktrees",
    openHarnessRoot,
    piAgentRoot: process.env.OPENHARNESS_PI_AGENT_ROOT?.trim() || "/tmp/openharness/pi",
    githubActionsExtensionDir: resolveGithubActionsExtensionDir(openHarnessRoot),
    workflowNotifyExtensionDir: resolveWorkflowNotifyExtensionDir(openHarnessRoot),
    linearActionsExtensionDir: resolveLinearActionsExtensionDir(openHarnessRoot),
    summarizationModelRef:
      process.env.OPENHARNESS_SUMMARIZATION_MODEL?.trim() || "openrouter/anthropic/claude-sonnet-4",
  });
}
