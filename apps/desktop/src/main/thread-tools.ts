import type { PiSlashCommand } from "@openharness/pi-rpc";
import type { SlashMenuItem, ToolInvocation } from "../shared/thread-tools.js";
import {
  buildAttachSlashMenuItems,
  mapPiCommandsToSlashMenuItems,
  THREAD_TOOL_CATALOG,
} from "../shared/thread-tools.js";
import { WORKFLOW_TOOL_CATALOG } from "../shared/workflow-slash-tools.js";
import {
  filterAvailableSlashMenuItems,
  getSlashToolAvailability,
} from "./slash-tool-availability.js";

export type { ToolInvocation } from "../shared/thread-tools.js";
export { expandPromptTools } from "./expand-prompt-tools.js";
export { mapPiCommandsToSlashMenuItems, mergeSlashMenuItems } from "../shared/thread-tools.js";

export type ToolSideEffectContext = {
  sessionKey: string;
  tools: ToolInvocation[];
  assistantText?: string;
};

export class ToolSideEffectRunner {
  async run(_context: ToolSideEffectContext): Promise<void> {
    // GitHub actions run via Pi tools during the agent turn.
  }
}

export function buildStaticSlashMenuItemsCatalog(): SlashMenuItem[] {
  return [
    ...THREAD_TOOL_CATALOG.map((entry) => ({
      toolId: entry.id,
      label: entry.label,
      description: entry.description,
      section: entry.section,
      ...(entry.iconClassName ? { iconClassName: entry.iconClassName } : {}),
    })),
    ...WORKFLOW_TOOL_CATALOG.map((entry) => ({
      toolId: entry.id,
      label: entry.label,
      description: entry.description,
      section: "tools" as const,
      iconClassName: "tool-icon-workflow",
    })),
  ];
}

export async function buildStaticSlashMenuItems(): Promise<SlashMenuItem[]> {
  const availability = await getSlashToolAvailability();
  return filterAvailableSlashMenuItems(buildStaticSlashMenuItemsCatalog(), availability);
}

export { buildAttachSlashMenuItems };

export function mapPiSlashCommandsToMenuItems(commands: PiSlashCommand[]): SlashMenuItem[] {
  return mapPiCommandsToSlashMenuItems(commands);
}
