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
  summarizationModelRef: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function defaultWorkerId(): string {
  const explicit = process.env.CLOUD_WORKER_ID?.trim();
  if (explicit) return explicit;
  return `${process.env.HOSTNAME ?? "cloud-worker"}-${process.pid}`;
}

/** Prefer IPv4 loopback — Node fetch can fail on localhost when only IPv4 is bound. */
function normalizeApiUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.replace(/\/$/, "");
  }
}

import { existsSync } from "node:fs";

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

export function loadCloudWorkerConfig(): CloudWorkerConfig {
  const apiUrl = normalizeApiUrl(
    process.env.OPENHARNESS_API_URL?.trim() ||
      process.env.BETTER_AUTH_URL?.trim() ||
      requiredEnv("OPENHARNESS_API_URL"),
  );
  const secret =
    process.env.CLOUD_WORKER_SECRET?.trim() || requiredEnv("CLOUD_WORKER_SECRET");
  const openHarnessRoot = process.env.OPENHARNESS_ROOT?.trim() || null;

  return {
    apiUrl,
    secret,
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
    summarizationModelRef:
      process.env.OPENHARNESS_SUMMARIZATION_MODEL?.trim() || "openrouter/anthropic/claude-sonnet-4",
  };
}
