import {
  BubbleChatIcon,
  Building06Icon,
  GaugeIcon,
  GitBranchIcon,
  Globe02Icon,
  Key01Icon,
  LockKeyIcon,
  Plug01Icon,
  PlayCircleIcon,
  Robot02Icon,
  ServerStackIcon,
  Settings01Icon,
  SwarmIcon,
  UserCircleIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { useOrgCanManageQuery } from "../../queries/use-org";
import {
  iconPrimary,
  sidenavNavIcon,
  sidenavNavRow,
  sidenavRowActive,
  sidenavRowHover,
} from "../main-workspace/constants";

export type OrgSettingsSection =
  | "org-details"
  | "org-members"
  | "org-source-control"
  | "org-integrations"
  | "org-linear-agents"
  | "org-runners"
  | "org-secrets"
  | "org-environments";

export type SettingsSection =
  | "account"
  | "usage"
  | OrgSettingsSection
  | "general"
  | "chat"
  | "oauth-providers"
  | "local-providers"
  | "swarm";

export function isOrgSettingsSection(section: SettingsSection): section is OrgSettingsSection {
  return section.startsWith("org-");
}

type NavItemDef = {
  id: SettingsSection;
  label: string;
  icon: IconSvgElement;
};

const GENERAL_ITEMS: NavItemDef[] = [
  { id: "general", label: "General", icon: Settings01Icon },
  { id: "account", label: "Account", icon: UserCircleIcon },
  { id: "usage", label: "Usage", icon: GaugeIcon },
];

const MIDDLE_ITEMS: NavItemDef[] = [
  { id: "chat", label: "Chat", icon: BubbleChatIcon },
  { id: "swarm", label: "Swarm", icon: SwarmIcon },
  { id: "oauth-providers", label: "OAuth providers", icon: Key01Icon },
  { id: "local-providers", label: "Local providers", icon: ServerStackIcon },
];

const ORG_ITEMS: NavItemDef[] = [
  { id: "org-details", label: "Details", icon: Building06Icon },
  { id: "org-members", label: "Members", icon: UserGroupIcon },
  { id: "org-environments", label: "Environments", icon: Globe02Icon },
  { id: "org-source-control", label: "Source control", icon: GitBranchIcon },
  { id: "org-integrations", label: "Integrations", icon: Plug01Icon },
  { id: "org-linear-agents", label: "Linear Agents", icon: Robot02Icon },
  { id: "org-runners", label: "Runners", icon: PlayCircleIcon },
  { id: "org-secrets", label: "Secrets", icon: LockKeyIcon },
];

const GENERAL_SETTINGS_ITEMS: NavItemDef[] = [...GENERAL_ITEMS, ...MIDDLE_ITEMS];

type SettingsNavProps = {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
};

function NavSectionLabel({ children }: { children: string }) {
  return (
    <h3 className="sidenav-section-label">{children}</h3>
  );
}

function NavItem({
  id,
  label,
  icon,
  active,
  onSelect,
}: NavItemDef & {
  active: boolean;
  onSelect: (section: SettingsSection) => void;
}) {
  return (
    <button
      type="button"
      className={`${sidenavNavRow} ${sidenavRowHover} ${
        active
          ? `${sidenavRowActive} text-slate-900 dark:text-neutral-100`
          : "text-slate-700 dark:text-neutral-300"
      }`}
      onClick={() => onSelect(id)}
    >
      <span className={sidenavNavIcon} aria-hidden>
        <HugeiconsIcon
          icon={icon}
          size={14}
          strokeWidth={1.5}
          className={active ? iconPrimary : "text-slate-500 dark:text-slate-400"}
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

export function SettingsNav({ active, onSelect }: SettingsNavProps) {
  const canManageQuery = useOrgCanManageQuery();
  const canManage = canManageQuery.data?.canManage ?? false;

  return (
    <div className="flex flex-col">
      <section className="sidenav-section">
        <NavSectionLabel>General settings</NavSectionLabel>
        <div className="mt-0.5 space-y-0.5">
          {GENERAL_SETTINGS_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              {...item}
              active={active === item.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </section>

      {canManage ? (
        <section className="sidenav-section mt-4">
          <NavSectionLabel>Organization</NavSectionLabel>
          <div className="mt-0.5 space-y-0.5">
            {ORG_ITEMS.map((item) => (
              <NavItem
                key={item.id}
                {...item}
                active={active === item.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
