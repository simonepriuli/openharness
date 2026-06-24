import { useState } from "react";
import { useOrgCanManageQuery, useOrgMembersQuery } from "../../queries/use-org";
import { OrgMembersSection } from "./OrgMembersSection";

export function OrganizationSettings() {
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
