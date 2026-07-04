import { createHash } from "node:crypto";

function sanitizeSandboxNamePart(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.slice(0, 64) || "x";
}

export function templateSandboxName(
  organizationId: string,
  projectSourceControlConnectionId: string,
  bundleFingerprint: string,
): string {
  const fingerprintPart = sanitizeSandboxNamePart(bundleFingerprint).slice(0, 16);
  return `openharness-repo-template-${sanitizeSandboxNamePart(organizationId)}-${sanitizeSandboxNamePart(projectSourceControlConnectionId)}-${fingerprintPart}`;
}

export function runSandboxName(runId: string): string {
  return `openharness-run-${sanitizeSandboxNamePart(runId)}`;
}

export function issueSandboxName(organizationId: string, linearIssueId: string): string {
  const digest = createHash("sha256")
    .update(`${organizationId}:${linearIssueId}`)
    .digest("hex")
    .slice(0, 16);
  const orgPart = sanitizeSandboxNamePart(organizationId).slice(0, 24);
  return `openharness-agent-issue-${orgPart}-${digest}`;
}
