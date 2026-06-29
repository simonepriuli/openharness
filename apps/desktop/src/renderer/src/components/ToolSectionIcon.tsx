import { AiMagicIcon, DocumentAttachmentIcon, GithubIcon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { isWorkflowToolId, toolIconClassName, type ToolSection } from "../../../shared/thread-tools";
import { DiscordIcon } from "./icons/DiscordIcon";
import { MsTeamsIcon } from "./icons/MsTeamsIcon";

interface ToolSectionIconProps {
  section: ToolSection;
  toolId?: string;
  size?: number;
  className?: string;
}

function iconForTool(section: ToolSection, toolId?: string): IconSvgElement | null {
  if (section === "attach") return DocumentAttachmentIcon;
  if (section === "skills") return AiMagicIcon;
  if (toolId === "teams_notify" || toolId === "discord_notify") return null;
  if (toolId && isWorkflowToolId(toolId)) return GithubIcon;
  if (section === "workflow") return GithubIcon;
  if (toolId === "web_search") return Globe02Icon;
  return Globe02Icon;
}

export function ToolSectionIcon({ section, toolId, size = 14, className }: ToolSectionIconProps) {
  const resolvedToolId = toolId ?? (section === "skills" ? "skill" : "");
  const colorClass = toolIconClassName(resolvedToolId, section);
  const classes = [className, colorClass, colorClass ? "tool-icon-colored" : undefined]
    .filter(Boolean)
    .join(" ");

  if (toolId === "teams_notify") {
    return <MsTeamsIcon size={size} className={classes || undefined} />;
  }
  if (toolId === "discord_notify") {
    return <DiscordIcon size={size} className={classes || undefined} />;
  }

  return (
    <HugeiconsIcon
      icon={iconForTool(section, toolId)!}
      size={size}
      strokeWidth={1.75}
      className={classes || undefined}
      aria-hidden
    />
  );
}
