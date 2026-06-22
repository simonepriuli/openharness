import { useCallback, useEffect, useState } from "react";
import { SettingsButton } from "./SettingsButton";
import { SettingsCard } from "./SettingsCard";

export function OrgDetailsSection() {
  const [orgName, setOrgName] = useState("");
  const [savedOrgName, setSavedOrgName] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameSavedMessage, setNameSavedMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [orgResult, manageResult] = await Promise.all([
      window.harness.getOrganization(),
      window.harness.getOrgCanManage(),
    ]);
    setOrgName(orgResult.organization.name);
    setSavedOrgName(orgResult.organization.name);
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
          setError(err instanceof Error ? err.message : "Failed to load organization");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const handleSaveName = useCallback(async () => {
    const nextName = orgName.trim();
    if (!nextName || nextName === savedOrgName) return;
    if (typeof window.harness.updateOrganization !== "function") {
      setNameError("Quit and reopen OpenHarness to enable organization renaming.");
      return;
    }
    setSavingName(true);
    setNameError(null);
    setNameSavedMessage(null);
    try {
      await window.harness.updateOrganization({ name: nextName });
      setSavedOrgName(nextName);
      setOrgName(nextName);
      setNameSavedMessage("Organization name saved.");
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to update organization name");
    } finally {
      setSavingName(false);
    }
  }, [orgName, savedOrgName]);

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
            disabled={savingName || !orgName.trim() || orgName.trim() === savedOrgName}
            onClick={() => void handleSaveName()}
          >
            {savingName ? "Saving…" : "Save"}
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
