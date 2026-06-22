import { useCallback, useEffect, useState } from "react";
import { OrgMembersSection } from "./OrgMembersSection";

type OrgMember = {
  id: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
};

export function OrganizationSettings() {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [membersResult, manageResult] = await Promise.all([
      window.harness.listOrgMembers(),
      window.harness.getOrgCanManage(),
    ]);
    setMembers(membersResult.members);
    setCanManage(manageResult.canManage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load members");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

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
      onReload={reload}
    />
  );
}
