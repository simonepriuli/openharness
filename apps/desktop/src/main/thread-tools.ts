import type { PiSlashCommand } from "@openharness/pi-rpc";
import type { SlashMenuItem, ToolInvocation } from "../shared/thread-tools.js";
import {
  buildAttachSlashMenuItems,
  mapPiCommandsToSlashMenuItems,
} from "../shared/thread-tools.js";
import { buildStaticSlashMenuItemsCatalog } from "../shared/slash-menu-catalog.js";
import {
  filterAvailableSlashMenuItems,
  getSlashToolAvailability,
} from "./slash-tool-availability.js";

export { buildStaticSlashMenuItemsCatalog } from "../shared/slash-menu-catalog.js";

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

export async function buildStaticSlashMenuItems(options?: {
  includeWorkflowNotifyTools?: boolean;
}): Promise<SlashMenuItem[]> {
  const availability = await getSlashToolAvailability();
  return filterAvailableSlashMenuItems(buildStaticSlashMenuItemsCatalog(options), availability);
}

export { buildAttachSlashMenuItems };

export function mapPiSlashCommandsToMenuItems(commands: PiSlashCommand[]): SlashMenuItem[] {
  return mapPiCommandsToSlashMenuItems(commands);
}
