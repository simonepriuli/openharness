import {
  AiMagicIcon,
  BubbleChatIcon,
  Building06Icon,
  ComputerIcon,
  GaugeIcon,
  GitBranchPlusIcon,
  Key01Icon,
  LockKeyIcon,
  Plug01Icon,
  ServerStackIcon,
  Settings01Icon,
  SwarmIcon,
  UserCircleIcon,
  XVariableIcon,
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
  | "organization"
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

const ORGANIZATION_NAV_ITEM: NavItemDef = {
  id: "organization",
  label: "Organization",
  icon: Building06Icon,
};

const ORG_SECTION_ITEMS: NavItemDef[] = [
  ORGANIZATION_NAV_ITEM,
  { id: "org-environments", label: "Environments", icon: XVariableIcon },
  { id: "org-source-control", label: "Source control", icon: GitBranchPlusIcon },
  { id: "org-integrations", label: "Integrations", icon: Plug01Icon },
  { id: "org-linear-agents", label: "Linear Agents", icon: AiMagicIcon },
  { id: "org-runners", label: "Runners", icon: ComputerIcon },
  { id: "org-secrets", label: "Secrets", icon: LockKeyIcon },
];

function isOrganizationNavActive(section: SettingsSection, itemId: SettingsSection): boolean {
  if (itemId === "organization") {
    return section === "organization" || section === "org-details" || section === "org-members";
  }
  return section === itemId;
}

type SettingsNavProps = {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
};

function NavGroup({
  items,
  active,
  onSelect,
  isItemActive,
}: {
  items: NavItemDef[];
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  isItemActive?: (section: SettingsSection, itemId: SettingsSection) => boolean;
}) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <NavItem
          key={item.id}
          {...item}
          active={isItemActive ? isItemActive(active, item.id) : active === item.id}
          onSelect={onSelect}
        />
      ))}
    </div>
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
    <div className="flex flex-col gap-4">
      <NavGroup items={GENERAL_ITEMS} active={active} onSelect={onSelect} />
      <NavGroup items={MIDDLE_ITEMS} active={active} onSelect={onSelect} />
      {canManage ? (
        <NavGroup
          items={ORG_SECTION_ITEMS}
          active={active}
          onSelect={onSelect}
          isItemActive={isOrganizationNavActive}
        />
      ) : null}
    </div>
  );
}
