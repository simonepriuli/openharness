import type { PiSlashCommand } from "@openharness/pi-rpc";
import type { SlashMenuItem, ToolInvocation } from "../shared/thread-tools.js";
import {
  buildAttachSlashMenuItems,
  mapPiCommandsToSlashMenuItems,
  THREAD_TOOL_CATALOG,
} from "../shared/thread-tools.js";

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
    // Reserved for post-response side effects (e.g. GitHub PR actions).
  }
}

export function buildStaticSlashMenuItems(): SlashMenuItem[] {
  return THREAD_TOOL_CATALOG.map((entry) => ({
    toolId: entry.id,
    label: entry.label,
    description: entry.description,
    section: entry.section,
    ...(entry.iconClassName ? { iconClassName: entry.iconClassName } : {}),
  }));
}

export { buildAttachSlashMenuItems };

export function mapPiSlashCommandsToMenuItems(commands: PiSlashCommand[]): SlashMenuItem[] {
  return mapPiCommandsToSlashMenuItems(commands);
}
