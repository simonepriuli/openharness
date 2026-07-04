import { writeFileSync } from "node:fs";
import { join } from "node:path";

const EXTENSION_MARKERS = {
  githubActions: "openharness-github-actions-version:4",
  workflowNotify: "openharness-workflow-notify-version:1",
  linearActions: "openharness-linear-actions-version:1",
} as const;

export function writeExtensionTemplate(dir: string, kind: keyof typeof EXTENSION_MARKERS): void {
  writeFileSync(join(dir, "index.ts"), `// ${EXTENSION_MARKERS[kind]}\n`, "utf8");
}

export function writeAllExtensionTemplates(options: {
  githubActionsExtensionDir: string;
  workflowNotifyExtensionDir: string;
  linearActionsExtensionDir: string;
}): void {
  writeExtensionTemplate(options.githubActionsExtensionDir, "githubActions");
  writeExtensionTemplate(options.workflowNotifyExtensionDir, "workflowNotify");
  writeExtensionTemplate(options.linearActionsExtensionDir, "linearActions");
}
