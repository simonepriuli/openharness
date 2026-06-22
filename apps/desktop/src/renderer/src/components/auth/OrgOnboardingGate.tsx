import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BrailleLoader } from "../BrailleLoader";
import { OrgOnboardingView } from "./OrgOnboardingView";

type OrgOnboardingGateProps = {
  children: ReactNode;
};

export function OrgOnboardingGate({ children }: OrgOnboardingGateProps) {
  const [checking, setChecking] = useState(true);
  const [hasOrganization, setHasOrganization] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window.harness?.getOrgOnboardingStatus !== "function") {
      setHasOrganization(true);
      setChecking(false);
      return;
    }
    try {
      const status = await window.harness.getOrgOnboardingStatus();
      setHasOrganization(status.hasOrganization);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check organization status");
      setHasOrganization(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (checking) {
    return (
      <div className="login-screen">
        <div className="login-screen-body">
          <div className="org-onboarding-loading">
            <BrailleLoader decorative />
            <p className="org-onboarding-loading-text">Loading organization…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="login-screen">
        <div className="login-screen-body">
          <div className="org-onboarding-panel">
            <p className="login-error org-onboarding-error" role="alert">
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasOrganization) {
    return <OrgOnboardingView onComplete={() => void refresh()} />;
  }

  return <>{children}</>;
}
