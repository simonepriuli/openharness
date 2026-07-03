import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CURATED_CLOUD_PROVIDER_SLOTS,
  isCuratedCloudProviderSlot,
  ORG_SECRET_SLOT_EXA,
} from "@openharness/shared/org-secret-slots";

const OPENHARNESS_GITHUB_ACTIONS_VERSION_MARKER = "openharness-github-actions-version:4";
const OPENHARNESS_WORKFLOW_NOTIFY_VERSION_MARKER = "openharness-workflow-notify-version:1";
const OPENHARNESS_LINEAR_ACTIONS_VERSION_MARKER = "openharness-linear-actions-version:1";

export type ResolvedOrgSecret = {
  slot: string;
  value: string;
};

export function buildPiAuthJsonFromOrgSecrets(
  secrets: ResolvedOrgSecret[],
): Record<string, { type: "api_key"; key: string }> {
  const auth: Record<string, { type: "api_key"; key: string }> = {};
  for (const secret of secrets) {
    if (isCuratedCloudProviderSlot(secret.slot)) {
      auth[secret.slot] = { type: "api_key", key: secret.value };
    }
  }
  return auth;
}

export function resolveExaApiKeyFromOrgSecrets(secrets: ResolvedOrgSecret[]): string | null {
  const exa = secrets.find((secret) => secret.slot === ORG_SECRET_SLOT_EXA);
  return exa?.value.trim() || null;
}

export function ensureCloudPiAgentDir(options: {
  agentDir: string;
  githubActionsExtensionDir: string;
  workflowNotifyExtensionDir: string;
  linearActionsExtensionDir: string;
  orgSecrets: ResolvedOrgSecret[];
}): string {
  mkdirSync(join(options.agentDir, "sessions"), { recursive: true });

  const auth = buildPiAuthJsonFromOrgSecrets(options.orgSecrets);
  writeFileSync(join(options.agentDir, "auth.json"), `${JSON.stringify(auth, null, 2)}\n`, {
    mode: 0o600,
  });

  copyGithubActionsExtension(options.agentDir, options.githubActionsExtensionDir);
  copyWorkflowNotifyExtension(options.agentDir, options.workflowNotifyExtensionDir);
  copyLinearActionsExtension(options.agentDir, options.linearActionsExtensionDir);
  return options.agentDir;
}

function copyGithubActionsExtension(agentDir: string, templateDir: string): void {
  const templateIndex = join(templateDir, "index.ts");
  if (!existsSync(templateIndex)) {
    throw new Error(`GitHub actions extension template missing: ${templateDir}`);
  }

  const destDir = join(agentDir, "extensions", "openharness-github-actions");
  const destIndex = join(destDir, "index.ts");
  let needsRefresh = true;
  if (existsSync(destIndex)) {
    const existing = readFileSync(destIndex, "utf8");
    if (existing.includes(OPENHARNESS_GITHUB_ACTIONS_VERSION_MARKER)) {
      needsRefresh = false;
    }
  }

  if (needsRefresh) {
    cpSync(templateDir, destDir, { recursive: true });
  }
}

function copyWorkflowNotifyExtension(agentDir: string, templateDir: string): void {
  const templateIndex = join(templateDir, "index.ts");
  if (!existsSync(templateIndex)) {
    throw new Error(`Workflow notify extension template missing: ${templateDir}`);
  }

  const destDir = join(agentDir, "extensions", "openharness-workflow-notify");
  const destIndex = join(destDir, "index.ts");
  let needsRefresh = true;
  if (existsSync(destIndex)) {
    const existing = readFileSync(destIndex, "utf8");
    if (existing.includes(OPENHARNESS_WORKFLOW_NOTIFY_VERSION_MARKER)) {
      needsRefresh = false;
    }
  }

  if (needsRefresh) {
    cpSync(templateDir, destDir, { recursive: true });
  }
}

function copyLinearActionsExtension(agentDir: string, templateDir: string): void {
  const templateIndex = join(templateDir, "index.ts");
  if (!existsSync(templateIndex)) {
    throw new Error(`Linear actions extension template missing: ${templateDir}`);
  }

  const destDir = join(agentDir, "extensions", "openharness-linear-actions");
  const destIndex = join(destDir, "index.ts");
  let needsRefresh = true;
  if (existsSync(destIndex)) {
    const existing = readFileSync(destIndex, "utf8");
    if (existing.includes(OPENHARNESS_LINEAR_ACTIONS_VERSION_MARKER)) {
      needsRefresh = false;
    }
  }

  if (needsRefresh) {
    cpSync(templateDir, destDir, { recursive: true });
  }
}

export const CURATED_PROVIDER_SLOTS = CURATED_CLOUD_PROVIDER_SLOTS;
