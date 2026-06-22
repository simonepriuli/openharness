import { useCallback, useState } from "react";
import { BrailleLoader } from "../BrailleLoader";
import { MacTitlebarGutter } from "../main-workspace/MacTitlebarGutter";
import { isMacUA } from "../main-workspace/constants";
import { SettingsTabs } from "../settings/SettingsTabs";
import { SettingsButton } from "../settings/SettingsButton";

const ONBOARDING_TABS = [
  { id: "join", label: "Join organization" },
  { id: "create", label: "Create organization" },
] as const;

type OrgOnboardingMode = (typeof ONBOARDING_TABS)[number]["id"];

type OrgOnboardingViewProps = {
  onComplete: () => void;
};

export function OrgOnboardingView({ onComplete }: OrgOnboardingViewProps) {
  const [mode, setMode] = useState<OrgOnboardingMode>("join");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMac = isMacUA && typeof window.harness !== "undefined";

  const handleCreate = useCallback(async () => {
    const name = orgName.trim();
    if (!name) {
      setError("Enter an organization name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await window.harness.createOrganization({ name });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setSubmitting(false);
    }
  }, [onComplete, orgName]);

  const handleJoin = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code) {
      setError("Enter an invite code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await window.harness.joinOrganizationWithCode({ code });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join organization");
    } finally {
      setSubmitting(false);
    }
  }, [inviteCode, onComplete]);

  const canSubmit = mode === "create" ? orgName.trim().length > 0 : inviteCode.trim().length > 0;

  return (
    <div className="login-screen org-onboarding-screen">
      <div className="app-region-drag login-screen-titlebar">
        <MacTitlebarGutter isMac={isMac} />
      </div>

      <div className="login-screen-body">
        <div className="org-onboarding-panel app-region-no-drag">
          <div className="org-onboarding-hero">
            <h1 className="org-onboarding-heading">Your organization</h1>
            <p className="org-onboarding-lead">Join an organization or create one.</p>
          </div>

          <SettingsTabs
            items={ONBOARDING_TABS}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
            }}
            ariaLabel="Organization setup"
            className="org-onboarding-tabs"
          />

          <div className="org-onboarding-form" key={mode}>
            {mode === "join" ? (
              <>
                <label className="org-onboarding-field">
                  <span className="org-onboarding-label">Invite code</span>
                  <input
                    type="text"
                    className="org-onboarding-input org-onboarding-code-input"
                    value={inviteCode}
                    placeholder="ABCD-EFGH"
                    autoFocus
                    autoCapitalize="characters"
                    spellCheck={false}
                    onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleJoin();
                    }}
                  />
                </label>
                <p className="org-onboarding-field-hint">
                  Ask your team admin for the code shared in organization settings.
                </p>
              </>
            ) : (
              <>
                <label className="org-onboarding-field">
                  <span className="org-onboarding-label">Organization name</span>
                  <input
                    type="text"
                    className="org-onboarding-input"
                    value={orgName}
                    placeholder="Acme Engineering"
                    autoFocus
                    onChange={(event) => setOrgName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleCreate();
                    }}
                  />
                </label>
                <p className="org-onboarding-field-hint">
                  This is how your team will identify your workspace.
                </p>
              </>
            )}

            {error ? (
              <p className="login-error org-onboarding-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="org-onboarding-actions">
              <SettingsButton
                size="sm"
                disabled={submitting || !canSubmit}
                onClick={() => void (mode === "create" ? handleCreate() : handleJoin())}
              >
                {submitting ? (
                  <>
                    <BrailleLoader className="login-button-spinner" decorative />
                    {mode === "create" ? "Creating…" : "Joining…"}
                  </>
                ) : mode === "create" ? (
                  "Create organization"
                ) : (
                  "Join organization"
                )}
              </SettingsButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
