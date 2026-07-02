import { BubbleChatIcon, Building06Icon, GaugeIcon, Globe02Icon, Key01Icon, ServerStackIcon, Settings01Icon, SwarmIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { iconPrimary, sidenavNavIcon, sidenavNavRow, sidenavRowActive, sidenavRowHover } from "../main-workspace/constants";

export type SettingsSection =
  | "account"
  | "usage"
  | "organization"
  | "general"
  | "chat"
  | "oauth-providers"
  | "local-providers"
  | "environments"
  | "swarm";

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
  { id: "account", label: "Account", icon: UserCircleIcon },
  { id: "usage", label: "Usage", icon: GaugeIcon },
  { id: "organization", label: "Organization", icon: Building06Icon },
  { id: "environments", label: "Environments", icon: Globe02Icon },
  { id: "chat", label: "Chat", icon: BubbleChatIcon },
  { id: "swarm", label: "Swarm", icon: SwarmIcon },
  { id: "oauth-providers", label: "OAuth providers", icon: Key01Icon },
  { id: "local-providers", label: "Local providers", icon: ServerStackIcon },
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
            className={`${sidenavNavRow} ${sidenavRowHover} ${
              isActive
                ? `${sidenavRowActive} text-slate-900 dark:text-neutral-100`
                : "text-slate-700 dark:text-neutral-300"
            }`}
            onClick={() => onSelect(item.id)}
          >
            <span className={sidenavNavIcon} aria-hidden>
              <HugeiconsIcon
                icon={item.icon}
                size={14}
                strokeWidth={1.5}
                className={isActive ? iconPrimary : "text-slate-500 dark:text-slate-400"}
              />
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </button>
        );
      })}
    </>
  );
}
