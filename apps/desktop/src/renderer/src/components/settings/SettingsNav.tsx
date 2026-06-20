import {
  BubbleChatIcon,
  CloudIcon,
  Globe02Icon,
  LinkSquare02Icon,
  ServerStackIcon,
  Settings01Icon,
  SwarmIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { iconPrimary, sidenavNavIcon, sidenavNavRow, sidenavRowActive, sidenavRowHover } from "../main-workspace/constants";

export type SettingsSection =
  | "account"
  | "general"
  | "chat"
  | "cloud-providers"
  | "local-providers"
  | "web-search"
  | "swarm"
  | "integrations";

type SettingsNavProps = {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
};

const ITEMS: {
  id: SettingsSection;
  label: string;
  icon: IconSvgElement;
}[] = [
  { id: "account", label: "Account", icon: UserCircleIcon },
  { id: "general", label: "General", icon: Settings01Icon },
  { id: "chat", label: "Chat", icon: BubbleChatIcon },
  { id: "cloud-providers", label: "Cloud providers", icon: CloudIcon },
  { id: "local-providers", label: "Local providers", icon: ServerStackIcon },
  { id: "web-search", label: "Web search", icon: Globe02Icon },
  { id: "integrations", label: "Integrations", icon: LinkSquare02Icon },
  { id: "swarm", label: "Swarm", icon: SwarmIcon },
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
