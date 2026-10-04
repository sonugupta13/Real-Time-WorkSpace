"use client";

import React from "react";

interface WorkspaceHeaderProps {
  user: any;
  workspaces: any[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenCreateWorkspaceModal: () => void;
  userRole: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | null;
  activeTab: "board" | "members" | "search" | "activity";
  onSelectTab: (tab: "board" | "members" | "search" | "activity") => void;
  onLogout: () => void;
  socketConnected: boolean;
}

export default function WorkspaceHeader({
  user,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenCreateWorkspaceModal,
  userRole,
  activeTab,
  onSelectTab,
  onLogout,
  socketConnected,
}: WorkspaceHeaderProps) {
  function getRoleBadgeClass(role: string | null) {
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
    <header className="site-nav">
      <div className="container">
        <div className="site-nav-inner" style={{ flexWrap: "wrap", gap: 16 }}>
          {/* Brand & Workspace Switcher */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div className="brand-mark">
              <span className="brand-dot" />
              <span>CollabSpace</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <select
                id="workspace-select"
                className="form-select"
                style={{ width: "auto", minWidth: 180, padding: "6px 12px", fontSize: "0.88rem" }}
                value={activeWorkspaceId}
                onChange={(e) => onSelectWorkspace(e.target.value)}
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>

              <button
                id="create-workspace-btn"
                type="button"
                className="btn-mini"
                title="Create Workspace"
                onClick={onOpenCreateWorkspaceModal}
                style={{ padding: "6px 10px", fontWeight: 600 }}
              >
                + New
              </button>

              {userRole && (
                <span className={getRoleBadgeClass(userRole)} id="user-role-badge">
                  {userRole}
                </span>
              )}
            </div>
          </div>

          {/* Real-time Status & User Menu */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.8rem",
                color: socketConnected ? "var(--text-secondary)" : "#DC2626",
                background: "var(--bg-surface-subtle)",
                padding: "4px 10px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--border-subtle)",
              }}
              title={socketConnected ? "Real-time sync active" : "Reconnecting to WebSocket..."}
            >
              <span className={`live-pulse ${socketConnected ? "" : "offline"}`} />
              <span>{socketConnected ? "Live Socket" : "Offline"}</span>
            </div>

            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{user?.name || user?.email}</span>
            </div>

            <button
              id="logout-btn"
              type="button"
              className="btn-mini"
              onClick={onLogout}
              style={{ padding: "6px 12px" }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="tab-bar" style={{ marginTop: 16, marginBottom: 0 }}>
          <button
            id="tab-board-btn"
            type="button"
            className={`tab-btn ${activeTab === "board" ? "active" : ""}`}
            onClick={() => onSelectTab("board")}
          >
            📋 Kanban Board
          </button>

          <button
            id="tab-members-btn"
            type="button"
            className={`tab-btn ${activeTab === "members" ? "active" : ""}`}
            onClick={() => onSelectTab("members")}
          >
            👥 Members & RBAC
          </button>

          <button
            id="tab-search-btn"
            type="button"
            className={`tab-btn ${activeTab === "search" ? "active" : ""}`}
            onClick={() => onSelectTab("search")}
          >
            🔍 Search & Filter
          </button>

          <button
            id="tab-activity-btn"
            type="button"
            className={`tab-btn ${activeTab === "activity" ? "active" : ""}`}
            onClick={() => onSelectTab("activity")}
          >
            🕒 Activity Log
          </button>
        </div>
      </div>
    </header>
  );
}
