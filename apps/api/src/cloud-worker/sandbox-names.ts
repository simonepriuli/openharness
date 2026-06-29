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
