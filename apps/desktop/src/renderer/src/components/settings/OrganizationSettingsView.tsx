import { useOrgCanManageQuery } from "../../queries/use-org";
import { OrgSecretsAiSettingsView } from "./OrgSecretsAiSettingsView";
import { SettingsTabs } from "./SettingsTabs";
import { useState } from "react";
import { OrgDetailsSection } from "./OrgDetailsSection";
import { OrganizationSettings } from "./OrganizationSettings";
import { OrgRunnersSection } from "./OrgRunnersSection";
import { IntegrationsSettingsView } from "./IntegrationsSettingsView";
import { LinearAgentsSettingsView } from "./LinearAgentsSettingsView";
import { SourceControlSettingsView } from "./SourceControlSettingsView";

type OrgTab =
  | "details"
  | "members"
  | "source-control"
  | "integrations"
  | "linear-agents"
  | "runners"
  | "secrets";

const ORG_TAB_DEFS: Array<{ id: OrgTab; label: string; adminOnly?: boolean }> = [
  { id: "details", label: "Details" },
  { id: "members", label: "Members" },
  { id: "source-control", label: "Source control" },
  { id: "integrations", label: "Integrations" },
  { id: "linear-agents", label: "Linear Agents", adminOnly: true },
  { id: "runners", label: "Runners" },
  { id: "secrets", label: "Secrets", adminOnly: true },
];

export function OrganizationSettingsView() {
  const [tab, setTab] = useState<OrgTab>("details");
  const canManageQuery = useOrgCanManageQuery();
  const canManage = canManageQuery.data?.canManage ?? false;

  const orgTabs = ORG_TAB_DEFS.map((item) => ({
    id: item.id,
    label: item.label,
    hidden: item.adminOnly ? !canManage : false,
  }));

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Organization</h2>

      <SettingsTabs
        items={orgTabs}
        value={tab}
        onChange={setTab}
        ariaLabel="Organization sections"
        className="mb-4"
      />

      {tab === "details" ? <OrgDetailsSection /> : null}
      {tab === "members" ? <OrganizationSettings /> : null}
      {tab === "source-control" ? <SourceControlSettingsView embedded /> : null}
      {tab === "integrations" ? <IntegrationsSettingsView embedded /> : null}
      {tab === "linear-agents" && canManage ? <LinearAgentsSettingsView embedded /> : null}
      {tab === "runners" ? <OrgRunnersSection /> : null}
      {tab === "secrets" && canManage ? <OrgSecretsAiSettingsView embedded /> : null}
    </div>
  );
}
