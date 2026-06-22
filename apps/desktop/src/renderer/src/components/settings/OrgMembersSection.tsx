import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsButton } from "./SettingsButton";
import { SettingsCard } from "./SettingsCard";

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

type OrgMembersSectionProps = {
  members: OrgMember[];
  canManage: boolean;
  actionError: string | null;
  onActionError: (message: string | null) => void;
  onReload: () => Promise<void>;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

function formatRole(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

function MemberAvatar({ member }: { member: OrgMember }) {
  const { user } = member;
  if (user.image) {
    return (
      <img
        className="org-members-avatar"
        src={user.image}
        alt=""
        width={32}
        height={32}
      />
    );
  }

  return (
    <div className="org-members-avatar org-members-avatar-fallback" aria-hidden>
      {getInitials(user.name)}
    </div>
  );
}

function MemberRowMenu({
  member,
  onMakeAdmin,
  onMakeMember,
  onRemove,
}: {
  member: OrgMember;
  onMakeAdmin: () => void;
  onMakeMember: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPanelEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setPanelEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="workflow-list-row-menu">
      <button
        type="button"
        className="workflow-list-row-menu-trigger"
        aria-label={`Actions for ${member.user.email}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.6} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={`Actions for ${member.user.email}`}
          className={`project-row-menu-shell workspace-panel-shell ${
            panelEntered ? "is-open" : "is-closed"
          } workflow-list-row-menu-panel`}
        >
          <div className="workspace-panel workflow-list-menu-inner">
            <div className="workspace-panel-menu">
              {member.role !== "admin" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-panel-item"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    onMakeAdmin();
                  }}
                >
                  <span className="workspace-panel-item-label">Make admin</span>
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="workspace-panel-item"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    onMakeMember();
                  }}
                >
                  <span className="workspace-panel-item-label">Make member</span>
                </button>
              )}
              <div className="workflow-list-row-menu-separator" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="workspace-panel-item"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onRemove();
                }}
              >
                <span className="workspace-panel-item-label">Remove</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrgInviteCodeCard({
  onActionError,
}: {
  onActionError: (message: string | null) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCode = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await window.harness.getOrgInviteCode();
      setCode(result.formatted || result.code);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load invite code");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCode();
  }, [loadCode]);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onActionError("Failed to copy invite code");
    }
  }, [code, onActionError]);

  const handleRegenerate = useCallback(async () => {
    const confirmed = window.confirm(
      "Regenerate invite code? The current code will stop working immediately.",
    );
    if (!confirmed) return;

    setRegenerating(true);
    onActionError(null);
    try {
      const result = await window.harness.regenerateOrgInviteCode();
      setCode(result.formatted || result.code);
    } catch (err) {
      onActionError(err instanceof Error ? err.message : "Failed to regenerate invite code");
    } finally {
      setRegenerating(false);
    }
  }, [onActionError]);

  return (
    <SettingsCard title="Invite code" padded={false}>
      <div className="settings-row settings-row-stack">
        <p className="settings-row-description">
          Share this code with teammates so they can join your organization after signing in.
        </p>
        {loading ? <p className="settings-muted">Loading invite code…</p> : null}
        {loadError ? (
          <p className="settings-error settings-row-feedback" role="alert">
            {loadError}
          </p>
        ) : null}
        {!loading && code ? (
          <div className="org-invite-code-row">
            <code className="org-invite-code-value">{code}</code>
            <div className="org-invite-code-actions">
              <SettingsButton size="sm" className="shrink-0" onClick={() => void handleCopy()}>
                {copied ? "Copied" : "Copy"}
              </SettingsButton>
              <SettingsButton
                size="sm"
                variant="secondary"
                className="shrink-0"
                disabled={regenerating}
                onClick={() => void handleRegenerate()}
              >
                {regenerating ? "Regenerating…" : "Regenerate"}
              </SettingsButton>
            </div>
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}

export function OrgMembersSection({
  members,
  canManage,
  actionError,
  onActionError,
  onReload,
}: OrgMembersSectionProps) {
  const handleRoleChange = useCallback(
    async (memberId: string, role: "member" | "admin") => {
      onActionError(null);
      try {
        await window.harness.updateOrgMemberRole({ memberId, role });
        await onReload();
      } catch (err) {
        onActionError(err instanceof Error ? err.message : "Failed to update role");
      }
    },
    [onActionError, onReload],
  );

  const handleRemove = useCallback(
    async (memberId: string) => {
      onActionError(null);
      try {
        await window.harness.removeOrgMember({ memberId });
        await onReload();
      } catch (err) {
        onActionError(err instanceof Error ? err.message : "Failed to remove member");
      }
    },
    [onActionError, onReload],
  );

  return (
    <section className="org-members-section settings-section">
      {canManage ? <OrgInviteCodeCard onActionError={onActionError} /> : null}

      <div className="org-members-header">
        <h3 className="settings-section-title">Members</h3>
      </div>

      {actionError ? (
        <p className="settings-error org-members-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="workflow-list-table-wrap">
        {members.length === 0 ? (
          <p className="workflow-list-empty settings-muted">No members yet.</p>
        ) : (
          <table className="workflow-list-table org-members-table">
            <thead>
              <tr>
                <th className="org-members-col-avatar" aria-label="Avatar" />
                <th>Email</th>
                <th>Role</th>
                {canManage ? <th aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="org-members-row">
                  <td className="org-members-col-avatar">
                    <MemberAvatar member={member} />
                  </td>
                  <td className="org-members-email">
                    <span className="org-members-email-address">{member.user.email}</span>
                    <span className="org-members-email-name">{member.user.name}</span>
                  </td>
                  <td className="org-members-role">{formatRole(member.role)}</td>
                  {canManage ? (
                    <td className="workflow-list-actions">
                      {member.role !== "owner" ? (
                        <MemberRowMenu
                          member={member}
                          onMakeAdmin={() => void handleRoleChange(member.id, "admin")}
                          onMakeMember={() => void handleRoleChange(member.id, "member")}
                          onRemove={() => void handleRemove(member.id)}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
