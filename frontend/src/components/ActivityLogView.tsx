"use client";

import React, { useState, useEffect } from "react";
import { workspaceApi } from "../services/api";

interface ActivityLogViewProps {
  workspaceId: string;
  token: string;
}

export default function ActivityLogView({ workspaceId, token }: ActivityLogViewProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  async function fetchActivity(page = 1) {
    setLoading(true);
    setErrorBanner(null);

    const res = await workspaceApi.getActivity(token, workspaceId, page, 15);

    setLoading(false);
    if (res.error) {
      setErrorBanner(res.error);
    } else if (res.data) {
      setActivities(res.data.activities || []);
      setPagination(res.data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
    }
  }

  useEffect(() => {
    fetchActivity(1);
  }, [workspaceId]);

  function getActionBadge(action: string) {
    if (action.includes("CREATE")) return <span className="status-pill success">{action}</span>;
    if (action.includes("MOVE") || action.includes("UPDATE")) return <span className="status-pill info">{action}</span>;
    if (action.includes("DELETE") || action.includes("REMOVE")) return <span className="status-pill warning">{action}</span>;
    return <span className="status-pill">{action}</span>;
  }

  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Workspace Audit & Activity Log</h2>
          <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: 4 }}>
            Immutable audit record of all task and member mutations scoped to this workspace.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fetchActivity(pagination.page)}
          disabled={loading}
          style={{ padding: "6px 12px", fontSize: "0.82rem" }}
        >
          {loading ? "Refreshing..." : "↻ Refresh Log"}
        </button>
      </div>

      {errorBanner && (
        <div className="alert-banner alert-error">
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Activity Log Table */}
      <div className="table-container">
        <table className="cream-table" id="activity-log-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Metadata / Details</th>
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
                  {loading ? "Loading audit logs..." : "No recorded activity in this workspace yet."}
                </td>
              </tr>
            ) : (
              activities.map((act) => (
                <tr key={act.id}>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                    {new Date(act.createdAt).toLocaleString()}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{act.user?.name || act.user?.email || "System"}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{act.user?.email}</div>
                  </td>
                  <td>{getActionBadge(act.action)}</td>
                  <td>
                    <span style={{ fontSize: "0.82rem", fontWeight: 500, fontFamily: "monospace" }}>
                      {act.entityType} ({act.entityId?.substring(0, 8)}...)
                    </span>
                  </td>
                  <td style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    {act.metadata ? (
                      <code style={{ background: "var(--bg-surface-subtle)", padding: "2px 6px", borderRadius: 4 }}>
                        {JSON.stringify(act.metadata)}
                      </code>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="pagination-bar">
        <div>
          Showing page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages || 1}</strong> (
          {pagination.total} total log entries)
        </div>
        <div className="pagination-controls">
          <button
            id="activity-prev-page-btn"
            type="button"
            className="btn-page"
            disabled={pagination.page <= 1 || loading}
            onClick={() => fetchActivity(pagination.page - 1)}
          >
            ← Previous
          </button>
          <button
            id="activity-next-page-btn"
            type="button"
            className="btn-page"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => fetchActivity(pagination.page + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
