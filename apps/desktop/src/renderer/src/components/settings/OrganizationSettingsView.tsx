import { useState } from "react";
import { IntegrationsSettingsView } from "./IntegrationsSettingsView";
import { OrgDetailsSection } from "./OrgDetailsSection";
import { OrganizationSettings } from "./OrganizationSettings";
import { OrgRunnersSection } from "./OrgRunnersSection";
import { SettingsTabs } from "./SettingsTabs";
import { SourceControlSettingsView } from "./SourceControlSettingsView";

const ORG_TABS = [
  { id: "details", label: "Details" },
  { id: "members", label: "Members" },
  { id: "source-control", label: "Source control" },
  { id: "integrations", label: "Integrations" },
  { id: "runners", label: "Runners" },
] as const;

type OrgTab = (typeof ORG_TABS)[number]["id"];

export function OrganizationSettingsView() {
  const [tab, setTab] = useState<OrgTab>("details");

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Organization</h2>

      <SettingsTabs
        items={ORG_TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="Organization sections"
        className="mb-4"
      />

      {tab === "details" ? <OrgDetailsSection /> : null}
      {tab === "members" ? <OrganizationSettings /> : null}
      {tab === "source-control" ? <SourceControlSettingsView embedded /> : null}
      {tab === "integrations" ? <IntegrationsSettingsView embedded /> : null}
      {tab === "runners" ? <OrgRunnersSection /> : null}
    </div>
  );
}
