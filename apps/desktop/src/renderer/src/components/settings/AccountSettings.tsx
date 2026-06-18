import { useCallback, useState } from "react";
import { useAuthUser } from "../../hooks/useAuthUser";
import { SettingsCard } from "./SettingsCard";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

function formatMemberSince(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function AccountSettings() {
  const { user, loading } = useAuthUser();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = useCallback(async () => {
    if (typeof window.signOut !== "function") {
      return;
    }

    setSigningOut(true);
    setSignOutError(null);
    try {
      await window.signOut();
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : "Failed to sign out");
    } finally {
      setSigningOut(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="settings-panel">
        <h2 className="settings-panel-title">Account</h2>
        <p className="settings-muted">Loading account…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="settings-panel">
        <h2 className="settings-panel-title">Account</h2>
        <p className="settings-muted">No signed-in account.</p>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Account</h2>

      <SettingsCard title="Profile" padded={false}>
        <div className="settings-row settings-row-static">
          <div className="settings-account-profile">
            {user.image ? (
              <img
                className="settings-account-avatar"
                src={user.image}
                alt=""
                width={48}
                height={48}
              />
            ) : (
              <div className="settings-account-avatar settings-account-avatar-fallback" aria-hidden>
                {getInitials(user.name)}
              </div>
            )}
            <div className="settings-account-profile-text">
              <div className="settings-row-label">{user.name}</div>
              <p className="settings-row-description">{user.email}</p>
              <p className="settings-muted settings-account-provider">Signed in with GitHub</p>
            </div>
          </div>
        </div>

        <div className="settings-row settings-row-static">
          <div className="settings-row-text">
            <div className="settings-row-label">Name</div>
            <p className="settings-row-description">{user.name}</p>
          </div>
        </div>

        <div className="settings-row settings-row-static">
          <div className="settings-row-text">
            <div className="settings-row-label">Email</div>
            <p className="settings-row-description">{user.email}</p>
          </div>
        </div>

        <div className="settings-row settings-row-static">
          <div className="settings-row-text">
            <div className="settings-row-label">Member since</div>
            <p className="settings-row-description">{formatMemberSince(user.createdAt)}</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Session" padded={false}>
        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
            <p className="settings-row-description">
              Signing out returns you to the login screen. Your local settings and conversations stay
              on this device.
            </p>
          </div>
          {signOutError ? (
            <p className="settings-error settings-row-feedback" role="alert">
              {signOutError}
            </p>
          ) : null}
          {typeof window.signOut === "function" ? (
            <button
              type="button"
              className="settings-button settings-button-secondary"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              {signingOut ? "Signing out…" : "Log out"}
            </button>
          ) : null}
        </div>
      </SettingsCard>
    </div>
  );
}
