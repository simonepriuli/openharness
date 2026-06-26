import { AiMagicIcon, DocumentAttachmentIcon, GithubIcon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { toolIconClassName, type ToolSection } from "../../../shared/thread-tools";

interface ToolSectionIconProps {
  section: ToolSection;
  toolId?: string;
  size?: number;
  className?: string;
}

function iconForTool(section: ToolSection, toolId?: string): IconSvgElement {
  if (section === "attach") return DocumentAttachmentIcon;
  if (section === "skills") return AiMagicIcon;
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

  return (
    <HugeiconsIcon
      icon={iconForTool(section, toolId)}
      size={size}
      strokeWidth={1.75}
      className={classes || undefined}
      aria-hidden
    />
  );
}
