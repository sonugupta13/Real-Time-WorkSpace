"use client";

import React, { useState, useEffect } from "react";
import { taskApi } from "../services/api";

interface SearchViewProps {
  workspaceId: string;
  token: string;
  members: any[];
}

export default function SearchView({ workspaceId, token, members }: SearchViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAssigneeId, setFilterAssigneeId] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  async function executeSearch(page = 1) {
    setLoading(true);
    setErrorBanner(null);

    const params: Record<string, any> = {
      page,
      limit: 10,
    };

    if (searchQuery.trim()) params.q = searchQuery.trim();
    if (filterPriority) params.priority = filterPriority;
    if (filterAssigneeId) params.assigneeId = filterAssigneeId;

    const res = await taskApi.search(token, workspaceId, params);

    setLoading(false);
    if (res.error) {
      setErrorBanner(res.error);
    } else if (res.data) {
      setTasks(res.data.tasks || []);
      setPagination(res.data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    }
  }

  // Initial load or when filters change
  useEffect(() => {
    executeSearch(1);
  }, [filterPriority, filterAssigneeId, workspaceId]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    executeSearch(1);
  }

  function handleReset() {
    setSearchQuery("");
    setFilterPriority("");
    setFilterAssigneeId("");
    setTimeout(() => {
      executeSearch(1);
    }, 0);
  }

  function getPriorityBadgeClass(priority: string) {
    switch (priority) {
      case "LOW":
        return "badge-priority badge-priority-low";
      case "MEDIUM":
        return "badge-priority badge-priority-medium";
      case "HIGH":
        return "badge-priority badge-priority-high";
      case "URGENT":
        return "badge-priority badge-priority-urgent";
      default:
        return "badge-priority";
    }
  }

  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Task Search & Multi-Field Filtering</h2>
        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: 4 }}>
          Search tasks across all boards and lists within this workspace with pagination.
        </p>
      </div>

      {errorBanner && (
        <div className="alert-banner alert-error">
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="cream-card" style={{ marginBottom: 24, padding: "20px" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 280px" }}>
            <label className="form-label">Full-Text Search (Title & Description)</label>
            <input
              id="search-input"
              type="text"
              className="form-input"
              placeholder="Search keyword (e.g. Docker, RBAC, WebSocket)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ width: 140 }}>
            <label className="form-label">Priority</label>
            <select
              id="filter-priority-select"
              className="form-select"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>

          <div style={{ width: 180 }}>
            <label className="form-label">Assignee</label>
            <select
              id="filter-assignee-select"
              className="form-select"
              value={filterAssigneeId}
              onChange={(e) => setFilterAssigneeId(e.target.value)}
            >
              <option value="">All Assignees</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.name || m.user?.email}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button id="search-submit-btn" type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
            <button type="button" className="btn-secondary" onClick={handleReset}>
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Search Results Table */}
      <div className="table-container">
        <table className="cream-table" id="search-results-table">
          <thead>
            <tr>
              <th>Task Title</th>
              <th>Board / List</th>
              <th>Priority</th>
              <th>Assignee</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
                  {loading ? "Searching tasks..." : "No tasks match your search criteria."}
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task.id} id={`search-task-row-${task.id}`}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{task.title}</div>
                    {task.description && (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 2 }}>
                        {task.description.length > 70 ? `${task.description.substring(0, 70)}...` : task.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      {task.list?.board?.title || "Board"} → <strong>{task.list?.title || "List"}</strong>
                    </span>
                  </td>
                  <td>
                    <span className={getPriorityBadgeClass(task.priority)}>{task.priority}</span>
                  </td>
                  <td>
                    {task.assignee ? (
                      <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        👤 {task.assignee.name || task.assignee.email}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Unassigned</span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    {new Date(task.createdAt).toLocaleDateString()}
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
          {pagination.total} total tasks)
        </div>
        <div className="pagination-controls">
          <button
            id="search-prev-page-btn"
            type="button"
            className="btn-page"
            disabled={pagination.page <= 1 || loading}
            onClick={() => executeSearch(pagination.page - 1)}
          >
            ← Previous
          </button>
          <button
            id="search-next-page-btn"
            type="button"
            className="btn-page"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => executeSearch(pagination.page + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
