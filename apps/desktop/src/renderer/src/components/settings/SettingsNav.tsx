import { ApiIcon, BubbleChatIcon, Settings01Icon, SwarmIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { iconPrimary, sidenavRowActive, sidenavRowHover } from "../main-workspace/constants";

export type SettingsSection = "general" | "chat" | "swarm" | "api";

type SettingsNavProps = {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
};

const ITEMS: {
  id: SettingsSection;
  label: string;
  icon: IconSvgElement;
}[] = [
  { id: "general", label: "General", icon: Settings01Icon },
  { id: "chat", label: "Chat", icon: BubbleChatIcon },
  { id: "swarm", label: "Swarm", icon: SwarmIcon },
  { id: "api", label: "API", icon: ApiIcon },
];

export function SettingsNav({ active, onSelect }: SettingsNavProps) {
  return (
    <>
      {ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`flex h-10 w-full min-w-0 items-center gap-2 rounded-md pl-3 pr-2 text-left text-sm font-medium transition-colors ${sidenavRowHover} ${
              isActive
                ? `${sidenavRowActive} text-slate-900 dark:text-neutral-100`
                : "text-slate-700 dark:text-neutral-300"
            }`}
            onClick={() => onSelect(item.id)}
          >
            <HugeiconsIcon
              icon={item.icon}
              size={14}
              strokeWidth={1.5}
              className={`shrink-0 ${isActive ? iconPrimary : "text-slate-500 dark:text-slate-400"}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </button>
        );
      })}
    </>
  );
}
