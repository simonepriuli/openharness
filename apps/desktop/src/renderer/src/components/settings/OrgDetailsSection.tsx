import { useEffect, useState } from "react";
import {
  useOrgCanManageQuery,
  useOrganizationQuery,
  useUpdateOrganizationMutation,
} from "../../queries/use-org";
import { SettingsButton } from "./SettingsButton";
import { SettingsCard } from "./SettingsCard";

export function OrgDetailsSection() {
  const orgQuery = useOrganizationQuery();
  const canManageQuery = useOrgCanManageQuery();
  const updateOrganization = useUpdateOrganizationMutation();

  const [orgName, setOrgName] = useState("");
  const [savedOrgName, setSavedOrgName] = useState("");
  const [nameSavedMessage, setNameSavedMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const organization = orgQuery.data?.organization;
  const canManage = canManageQuery.data?.canManage ?? false;

  useEffect(() => {
    if (!organization) return;
    setOrgName(organization.name);
    setSavedOrgName(organization.name);
  }, [organization?.name]);

  const loading =
    (orgQuery.isPending && !orgQuery.data) || (canManageQuery.isPending && !canManageQuery.data);
  const error =
    (orgQuery.error instanceof Error ? orgQuery.error.message : null) ??
    (canManageQuery.error instanceof Error ? canManageQuery.error.message : null);

  const handleSaveName = async () => {
    const nextName = orgName.trim();
    if (!nextName || nextName === savedOrgName) return;
    if (typeof window.harness.updateOrganization !== "function") {
      setNameError("Quit and reopen OpenHarness to enable organization renaming.");
      return;
    }
    setNameError(null);
    setNameSavedMessage(null);
    try {
      await updateOrganization.mutateAsync({ name: nextName });
      setSavedOrgName(nextName);
      setOrgName(nextName);
      setNameSavedMessage("Organization name saved.");
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to update organization name");
    }
  };

  if (loading) {
    return <p className="settings-muted">Loading organization…</p>;
  }

  if (error) {
    return <p className="settings-error">{error}</p>;
  }

  return (
    <SettingsCard title="Details" padded={false}>
      {canManage ? (
        <div className="settings-row settings-row-stack">
          <label className="settings-row-text">
            <span className="settings-row-label">Name</span>
            <input
              type="text"
              className="settings-input"
              value={orgName}
              onChange={(event) => {
                setOrgName(event.target.value);
                setNameSavedMessage(null);
                setNameError(null);
              }}
            />
          </label>
          {nameError ? (
            <p className="settings-error settings-row-feedback" role="alert">
              {nameError}
            </p>
          ) : null}
          {nameSavedMessage ? (
            <p className="settings-status settings-row-feedback">{nameSavedMessage}</p>
          ) : null}
          <SettingsButton
            size="sm"
            className="shrink-0 self-start"
            disabled={
              updateOrganization.isPending || !orgName.trim() || orgName.trim() === savedOrgName
            }
            onClick={() => void handleSaveName()}
          >
            {updateOrganization.isPending ? "Saving…" : "Save"}
          </SettingsButton>
        </div>
      ) : (
        <div className="settings-row settings-row-static">
          <div className="settings-row-text">
            <div className="settings-row-label">Name</div>
            <p className="settings-row-description">{orgName || "Organization"}</p>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
