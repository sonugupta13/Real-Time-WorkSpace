"use client";

import React, { useState } from "react";
import { memberApi } from "../services/api";

interface MembersViewProps {
  workspaceId: string;
  token: string;
  members: any[];
  userRole: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | null;
  currentUserId: string;
  onRefreshMembers: () => void;
}

export default function MembersView({
  workspaceId,
  token,
  members,
  userRole,
  currentUserId,
  onRefreshMembers,
}: MembersViewProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER");
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const canManageMembers = userRole === "OWNER" || userRole === "ADMIN";

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setErrorBanner(null);
    setSuccessBanner(null);
    setLoading(true);

    const res = await memberApi.invite(token, workspaceId, {
      email: inviteEmail.trim(),
      role: inviteRole,
    });

    setLoading(false);
    if (res.error) {
      setErrorBanner(res.error);
    } else {
      setSuccessBanner(`Successfully invited ${inviteEmail.trim()} as ${inviteRole}!`);
      setInviteEmail("");
      setInviteRole("MEMBER");
      onRefreshMembers();
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    setErrorBanner(null);
    setSuccessBanner(null);

    const res = await memberApi.updateRole(token, workspaceId, memberId, newRole);
    if (res.error) {
      setErrorBanner(res.error);
    } else {
      setSuccessBanner("Member role updated successfully.");
      onRefreshMembers();
    }
  }

  async function handleRemoveMember(memberId: string, memberEmail: string) {
    if (!confirm(`Are you sure you want to remove ${memberEmail} from this workspace?`)) return;
    setErrorBanner(null);
    setSuccessBanner(null);

    const res = await memberApi.remove(token, workspaceId, memberId);
    if (res.error) {
      setErrorBanner(res.error);
    } else {
      setSuccessBanner(`Removed member ${memberEmail}.`);
      onRefreshMembers();
    }
  }

  function getRoleBadgeClass(role: string) {
    switch (role) {
      case "OWNER":
        return "badge-role badge-role-owner";
      case "ADMIN":
        return "badge-role badge-role-admin";
      case "MEMBER":
        return "badge-role badge-role-member";
      case "VIEWER":
        return "badge-role badge-role-viewer";
      default:
        return "badge-role";
    }
  }

  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Workspace Members & Access Control</h2>
          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: 4 }}>
            Manage collaborators, assign roles, and configure workspace access privileges.
          </p>
        </div>
      </div>

      {errorBanner && (
        <div className="alert-banner alert-error">
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {successBanner && (
        <div className="alert-banner alert-success">
          <span>{successBanner}</span>
          <button type="button" onClick={() => setSuccessBanner(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Invite Member Box (Only for Owner or Admin) */}
      {canManageMembers ? (
        <div className="cream-card" style={{ marginBottom: 28, padding: "20px 24px" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 12 }}>Invite New Collaborator</h3>
          <form onSubmit={handleInvite} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 240px" }}>
              <label className="form-label">User Email Address</label>
              <input
                id="invite-email-input"
                type="email"
                className="form-input"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>

            <div style={{ width: 150 }}>
              <label className="form-label">Role</label>
              <select
                id="invite-role-select"
                className="form-select"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
              >
                {userRole === "OWNER" && <option value="ADMIN">Admin</option>}
                <option value="MEMBER">Member</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </div>

            <button
              id="submit-invite-btn"
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ padding: "10px 20px" }}
            >
              {loading ? "Inviting..." : "Send Invite"}
            </button>
          </form>
        </div>
      ) : (
        <div className="alert-banner alert-info" style={{ marginBottom: 24 }}>
          <span>
            ℹ️ You are a <strong>{userRole}</strong>. Member invitations and role management require <strong>Owner</strong> or <strong>Admin</strong> privileges.
          </span>
        </div>
      )}

      {/* Members Table */}
      <div className="table-container">
        <table className="cream-table" id="members-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Email</th>
              <th>Current Role</th>
              <th>Joined Date</th>
              {canManageMembers && <th style={{ textAlign: "right" }}>Role Management</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              const isTargetOwner = m.role === "OWNER";
              const canEditThisMember =
                canManageMembers &&
                !isTargetOwner &&
                (userRole === "OWNER" || (userRole === "ADMIN" && m.role !== "ADMIN"));

              return (
                <tr key={m.id} id={`member-row-${m.id}`}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {m.user?.name || "Unnamed"} {isSelf && <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>(You)</span>}
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{m.user?.email}</td>
                  <td>
                    <span className={getRoleBadgeClass(m.role)}>{m.role}</span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "Active"}
                  </td>
                  {canManageMembers && (
                    <td style={{ textAlign: "right" }}>
                      {canEditThisMember ? (
                        <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <select
                            id={`role-select-${m.id}`}
                            className="form-select"
                            style={{ width: "auto", padding: "4px 8px", fontSize: "0.8rem" }}
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          >
                            {userRole === "OWNER" && <option value="ADMIN">ADMIN</option>}
                            <option value="MEMBER">MEMBER</option>
                            <option value="VIEWER">VIEWER</option>
                          </select>

                          <button
                            id={`remove-member-${m.id}-btn`}
                            type="button"
                            className="btn-mini danger"
                            onClick={() => handleRemoveMember(m.id, m.user?.email || "Member")}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {isTargetOwner ? "Workspace Owner" : "Protected"}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
