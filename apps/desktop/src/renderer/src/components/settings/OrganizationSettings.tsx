import { useState } from "react";
import { useOrgCanManageQuery, useOrgMembersQuery } from "../../queries/use-org";
import { OrgDetailsSection } from "./OrgDetailsSection";
import { OrgMembersSection } from "./OrgMembersSection";
import { SettingsTabs } from "./SettingsTabs";

export type OrganizationTab = "details" | "members";

const ORGANIZATION_TABS = [
  { id: "details", label: "Details" },
  { id: "members", label: "Members" },
] as const;

type OrganizationSettingsProps = {
  initialTab?: OrganizationTab;
};

function OrganizationMembersPanel() {
  const membersQuery = useOrgMembersQuery();
  const canManageQuery = useOrgCanManageQuery();
  const [actionError, setActionError] = useState<string | null>(null);

  const members = membersQuery.data?.members ?? [];
  const canManage = canManageQuery.data?.canManage ?? false;
  const loading =
    (membersQuery.isPending && !membersQuery.data) ||
    (canManageQuery.isPending && !canManageQuery.data);
  const error =
    (membersQuery.error instanceof Error ? membersQuery.error.message : null) ??
    (canManageQuery.error instanceof Error ? canManageQuery.error.message : null);

  if (loading) {
    return <p className="settings-muted">Loading members…</p>;
  }

  if (error) {
    return <p className="settings-error">{error}</p>;
  }

  return (
    <OrgMembersSection
      members={members}
      canManage={canManage}
      actionError={actionError}
      onActionError={setActionError}
    />
  );
}

export function OrganizationSettings({ initialTab = "details" }: OrganizationSettingsProps) {
  const [tab, setTab] = useState<OrganizationTab>(initialTab);

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Organization</h2>
      <SettingsTabs
        variant="pill"
        className="organization-settings-tabs"
        value={tab}
        onChange={setTab}
        ariaLabel="Organization sections"
        items={ORGANIZATION_TABS}
      />
      <div className="organization-settings-body">
        {tab === "details" ? <OrgDetailsSection /> : <OrganizationMembersPanel />}
      </div>
    </div>
  );
}
