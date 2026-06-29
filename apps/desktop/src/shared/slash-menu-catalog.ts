import {
  isNotifyWorkflowToolId,
  WORKFLOW_TOOL_CATALOG,
} from "@openharness/shared/workflow-slash-tools";
import { THREAD_TOOL_CATALOG, type SlashMenuItem } from "./thread-tools.js";

export function buildStaticSlashMenuItemsCatalog(options?: {
  /** Workflow-run notify tools are only available in workflow instructions, not chat threads. */
  includeWorkflowNotifyTools?: boolean;
}): SlashMenuItem[] {
  const includeNotify = options?.includeWorkflowNotifyTools ?? false;
  const workflowEntries = WORKFLOW_TOOL_CATALOG.filter(
    (entry) => includeNotify || !isNotifyWorkflowToolId(entry.id),
  );

  return [
    ...THREAD_TOOL_CATALOG.map((entry) => ({
      toolId: entry.id,
      label: entry.label,
      description: entry.description,
      section: entry.section,
      ...(entry.iconClassName ? { iconClassName: entry.iconClassName } : {}),
    })),
    ...workflowEntries.map((entry) => ({
      toolId: entry.id,
      label: entry.label,
      description: entry.description,
      section: "tools" as const,
      iconClassName: "tool-icon-workflow",
    })),
  ];
}
