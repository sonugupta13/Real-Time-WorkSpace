"use client";

import React, { useState } from "react";
import { taskApi, listApi, boardApi } from "../services/api";

interface KanbanBoardProps {
  workspaceId: string;
  token: string;
  boards: any[];
  activeBoard: any | null;
  onSelectBoard: (boardId: string) => void;
  onRefreshBoard: () => void;
  userRole: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | null;
  members: any[];
  onOpenExportModal: () => void;
  recentUpdatedTaskId: string | null;
}

export default function KanbanBoard({
  workspaceId,
  token,
  boards,
  activeBoard,
  onSelectBoard,
  onRefreshBoard,
  userRole,
  members,
  onOpenExportModal,
  recentUpdatedTaskId,
}: KanbanBoardProps) {
  // Modal states
  const [showCreateBoardModal, setShowCreateBoardModal] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newBoardDesc, setNewBoardDesc] = useState("");

  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");

  const [activeListForNewTask, setActiveListForNewTask] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<string>("");

  const [editingTask, setEditingTask] = useState<any | null>(null);

  // Drag and Drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);

  // Loading & error feedback
  const [actionLoading, setActionLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const canEdit = userRole === "OWNER" || userRole === "ADMIN" || userRole === "MEMBER";

  // 1. Board Creation
  async function handleCreateBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!newBoardTitle.trim()) return;
    setActionLoading(true);
    setErrorBanner(null);

    const res = await boardApi.create(token, workspaceId, {
      title: newBoardTitle.trim(),
      description: newBoardDesc.trim() || undefined,
    });

    setActionLoading(false);
    if (res.error) {
      setErrorBanner(res.error);
    } else if (res.data) {
      setNewBoardTitle("");
      setNewBoardDesc("");
      setShowCreateBoardModal(false);
      onSelectBoard(res.data.board.id);
    }
  }

  // 2. List Creation
  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListTitle.trim() || !activeBoard) return;
    setActionLoading(true);
    setErrorBanner(null);

    const res = await listApi.create(token, workspaceId, activeBoard.id, newListTitle.trim());
    setActionLoading(false);
    if (res.error) {
      setErrorBanner(res.error);
    } else {
      setNewListTitle("");
      setShowCreateListModal(false);
      onRefreshBoard();
    }
  }

  // 3. Delete List
  async function handleDeleteList(listId: string) {
    if (!confirm("Are you sure you want to delete this list and all its tasks?")) return;
    setErrorBanner(null);
    const res = await listApi.delete(token, workspaceId, listId);
    if (res.error) {
      setErrorBanner(res.error);
    } else {
      onRefreshBoard();
    }
  }

  // 4. Task Creation
  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !activeListForNewTask) return;
    setActionLoading(true);
    setErrorBanner(null);

    const res = await taskApi.create(token, workspaceId, activeListForNewTask, {
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim() || undefined,
      priority: newTaskPriority,
      assigneeId: newTaskAssigneeId || undefined,
    });

    setActionLoading(false);
    if (res.error) {
      setErrorBanner(res.error);
    } else {
      setNewTaskTitle("");
      setNewTaskDesc("");
      setNewTaskPriority("MEDIUM");
      setNewTaskAssigneeId("");
      setActiveListForNewTask(null);
      onRefreshBoard();
    }
  }

  // 5. Task Update
  async function handleUpdateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTask) return;
    setActionLoading(true);
    setErrorBanner(null);

    const res = await taskApi.update(token, workspaceId, editingTask.id, {
      title: editingTask.title.trim(),
      description: editingTask.description ? editingTask.description.trim() : null,
      priority: editingTask.priority,
      assigneeId: editingTask.assigneeId || null,
    });

    setActionLoading(false);
    if (res.error) {
      setErrorBanner(res.error);
    } else {
      setEditingTask(null);
      onRefreshBoard();
    }
  }

  // 6. Task Deletion
  async function handleDeleteTask(taskId: string) {
    if (!confirm("Are you sure you want to delete this task?")) return;
    setErrorBanner(null);
    const res = await taskApi.delete(token, workspaceId, taskId);
    if (res.error) {
      setErrorBanner(res.error);
    } else {
      if (editingTask?.id === taskId) {
        setEditingTask(null);
      }
      onRefreshBoard();
    }
  }

  // 7. Drag & Drop Task Movement
  function handleDragStart(e: React.DragEvent, taskId: string) {
    if (!canEdit) return;
    setDraggedTaskId(taskId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, listId: string) {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverListId !== listId) {
      setDragOverListId(listId);
    }
  }

  function handleDragLeave(e: React.DragEvent, listId: string) {
    if (dragOverListId === listId) {
      setDragOverListId(null);
    }
  }

  async function handleDrop(e: React.DragEvent, targetListId: string) {
    e.preventDefault();
    setDragOverListId(null);
    const taskId = draggedTaskId || e.dataTransfer.getData("text/plain");
    setDraggedTaskId(null);

    if (!taskId || !canEdit || !activeBoard) return;

    // Find the target list and calculate position
    const targetList = activeBoard.lists.find((l: any) => l.id === targetListId);
    if (!targetList) return;

    const listTasks = targetList.tasks || [];
    const highestPos = listTasks.length > 0
      ? Math.max(...listTasks.map((t: any) => t.position || 0))
      : 0;

    const newPosition = highestPos + 1000;

    // Execute Move API
    const res = await taskApi.move(token, workspaceId, taskId, {
      targetListId,
      newPosition,
    });

    if (res.error) {
      setErrorBanner(res.error);
    } else {
      onRefreshBoard();
    }
  }

  // 8. Quick Move Button (for accessibility & reliable automated testing)
  async function handleQuickMove(taskId: string, targetListId: string) {
    if (!canEdit || !activeBoard) return;
    const targetList = activeBoard.lists.find((l: any) => l.id === targetListId);
    if (!targetList) return;

    const listTasks = targetList.tasks || [];
    const highestPos = listTasks.length > 0
      ? Math.max(...listTasks.map((t: any) => t.position || 0))
      : 0;
    const newPosition = highestPos + 1000;

    const res = await taskApi.move(token, workspaceId, taskId, {
      targetListId,
      newPosition,
    });

    if (res.error) {
      setErrorBanner(res.error);
    } else {
      onRefreshBoard();
    }
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
      {/* Viewer Warning Banner */}
      {!canEdit && (
        <div className="alert-banner alert-warning" id="viewer-readonly-notice">
          <span>
            <strong>👁️ Read-Only Mode:</strong> Your role is <strong>{userRole || "VIEWER"}</strong>. You have view
            permissions only. Creating, modifying, moving, and deleting tasks are disabled.
          </span>
        </div>
      )}

      {errorBanner && (
        <div className="alert-banner alert-error">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Board Selector & Header Bar */}
      <div className="kanban-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label className="form-label" style={{ margin: 0 }}>Board:</label>
          <select
            id="board-select"
            className="form-select"
            style={{ width: "auto", minWidth: 200, padding: "6px 12px" }}
            value={activeBoard?.id || ""}
            onChange={(e) => onSelectBoard(e.target.value)}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>

          {canEdit && (
            <button
              id="create-board-btn"
              type="button"
              className="btn-mini"
              onClick={() => setShowCreateBoardModal(true)}
              style={{ padding: "6px 12px" }}
            >
              + New Board
            </button>
          )}

          {activeBoard && (
            <button
              id="export-board-btn"
              type="button"
              className="btn-mini"
              onClick={onOpenExportModal}
              title="Enqueue BullMQ background export job"
              style={{ padding: "6px 12px", background: "var(--bg-surface-subtle)" }}
            >
              📥 Export Board (Async Job)
            </button>
          )}
        </div>

        {canEdit && activeBoard && (
          <button
            id="add-list-btn"
            type="button"
            className="btn-primary"
            onClick={() => setShowCreateListModal(true)}
            style={{ padding: "8px 16px", fontSize: "0.85rem" }}
          >
            + Add List Column
          </button>
        )}
      </div>

      {/* Kanban Columns Grid */}
      {!activeBoard ? (
        <div className="cream-card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <h3>No board selected</h3>
          <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
            Create a board to start organizing tasks and collaborating.
          </p>
          {canEdit && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowCreateBoardModal(true)}
              style={{ marginTop: 16 }}
            >
              Create First Board
            </button>
          )}
        </div>
      ) : (
        <div
          className="kanban-board-grid"
          id="kanban-columns-container"
          style={{
            display: "flex",
            gap: 20,
            overflowX: "auto",
            paddingBottom: 16,
            alignItems: "flex-start",
          }}
        >
          {activeBoard.lists && activeBoard.lists.length === 0 && (
            <div className="cream-card" style={{ width: "100%", textAlign: "center", padding: "40px 20px" }}>
              <p style={{ color: "var(--text-secondary)" }}>
                This board has no lists yet. Add a list like &quot;To Do&quot;, &quot;In Progress&quot;, or &quot;Done&quot;.
              </p>
              {canEdit && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowCreateListModal(true)}
                  style={{ marginTop: 16 }}
                >
                  + Add List Column
                </button>
              )}
            </div>
          )}

          {activeBoard.lists?.map((list: any) => {
            const isDragOver = dragOverListId === list.id;
            return (
              <div
                key={list.id}
                id={`list-col-${list.id}`}
                className={`kanban-column ${isDragOver ? "drag-over" : ""}`}
                style={{ minWidth: 290, maxWidth: 320, flexShrink: 0 }}
                onDragOver={(e) => handleDragOver(e, list.id)}
                onDragLeave={(e) => handleDragLeave(e, list.id)}
                onDrop={(e) => handleDrop(e, list.id)}
              >
                <div className="kanban-column-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>{list.title}</span>
                    <span className="kanban-column-count">{list.tasks?.length || 0}</span>
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      className="btn-mini danger"
                      onClick={() => handleDeleteList(list.id)}
                      title="Delete List"
                      style={{ padding: "2px 6px", fontSize: "0.7rem" }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Tasks Container */}
                <div className="kanban-task-list" id={`task-list-${list.id}`}>
                  {list.tasks?.map((task: any) => {
                    const isDragging = draggedTaskId === task.id;
                    const isRecentlyUpdated = recentUpdatedTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        id={`task-card-${task.id}`}
                        className={`kanban-task-card ${isDragging ? "dragging" : ""} ${
                          isRecentlyUpdated ? "realtime-flash" : ""
                        }`}
                        draggable={canEdit}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <span className="kanban-task-title">{task.title}</span>
                          <span className={getPriorityBadgeClass(task.priority)}>{task.priority}</span>
                        </div>

                        {task.description && (
                          <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "6px 0", lineHeight: 1.4 }}>
                            {task.description}
                          </p>
                        )}

                        <div className="kanban-task-meta">
                          <span>
                            {task.assignee ? (
                              <span title={task.assignee.email} style={{ fontWeight: 600 }}>
                                👤 {task.assignee.name || task.assignee.email}
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-muted)" }}>Unassigned</span>
                            )}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            pos: {task.position}
                          </span>
                        </div>

                        {/* Task Action Buttons */}
                        {canEdit && (
                          <div className="kanban-actions-row" style={{ flexWrap: "wrap" }}>
                            <button
                              id={`edit-task-btn-${task.id}`}
                              type="button"
                              className="btn-mini"
                              onClick={() => setEditingTask(task)}
                            >
                              Edit
                            </button>

                            <button
                              id={`delete-task-btn-${task.id}`}
                              type="button"
                              className="btn-mini danger"
                              onClick={() => handleDeleteTask(task.id)}
                            >
                              Delete
                            </button>

                            {/* Quick Move Dropdown */}
                            <select
                              className="btn-mini"
                              style={{ padding: "3px 6px", cursor: "pointer", maxWidth: 110 }}
                              value=""
                              onChange={(e) => {
                                if (e.target.value) handleQuickMove(task.id, e.target.value);
                              }}
                            >
                              <option value="">Move to...</option>
                              {activeBoard.lists
                                .filter((l: any) => l.id !== list.id)
                                .map((otherList: any) => (
                                  <option key={otherList.id} value={otherList.id}>
                                    → {otherList.title}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Task Button for this list */}
                {canEdit && (
                  <button
                    id={`add-task-to-${list.id}-btn`}
                    type="button"
                    className="btn-secondary"
                    onClick={() => setActiveListForNewTask(list.id)}
                    style={{ width: "100%", justifyContent: "center", padding: "8px 12px", fontSize: "0.82rem" }}
                  >
                    + Add Task
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Modal: Create Board */}
      {/* ---------------------------------------------------- */}
      {showCreateBoardModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create New Board</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateBoardModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateBoard}>
              <div className="form-group">
                <label className="form-label">Board Title</label>
                <input
                  id="new-board-title-input"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Sprint 24, Product Roadmap"
                  value={newBoardTitle}
                  onChange={(e) => setNewBoardTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <textarea
                  className="form-textarea"
                  placeholder="Board description or goals..."
                  value={newBoardDesc}
                  onChange={(e) => setNewBoardDesc(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateBoardModal(false)}
                >
                  Cancel
                </button>
                <button
                  id="submit-create-board-btn"
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Creating..." : "Create Board"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Modal: Create List */}
      {/* ---------------------------------------------------- */}
      {showCreateListModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add Column / List</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateListModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateList}>
              <div className="form-group">
                <label className="form-label">Column Title</label>
                <input
                  id="new-list-title-input"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Backlog, Review, QA"
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateListModal(false)}
                >
                  Cancel
                </button>
                <button
                  id="submit-create-list-btn"
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Adding..." : "Add Column"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Modal: Create Task */}
      {/* ---------------------------------------------------- */}
      {activeListForNewTask && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create New Task</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setActiveListForNewTask(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="form-group">
                <label className="form-label">Task Title</label>
                <input
                  id="new-task-title-input"
                  type="text"
                  className="form-input"
                  placeholder="What needs to be done?"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  id="new-task-desc-input"
                  className="form-textarea"
                  placeholder="Detailed task description..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Priority</label>
                <select
                  id="new-task-priority-select"
                  className="form-select"
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as any)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Assignee</label>
                <select
                  id="new-task-assignee-select"
                  className="form-select"
                  value={newTaskAssigneeId}
                  onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                >
                  <option value="">-- Unassigned --</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user?.name || m.user?.email} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setActiveListForNewTask(null)}
                >
                  Cancel
                </button>
                <button
                  id="submit-create-task-btn"
                  type="submit"
                  className="btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Creating..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Modal: Edit Task */}
      {/* ---------------------------------------------------- */}
      {editingTask && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Edit Task</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingTask(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdateTask}>
              <div className="form-group">
                <label className="form-label">Task Title</label>
                <input
                  id="edit-task-title-input"
                  type="text"
                  className="form-input"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  id="edit-task-desc-input"
                  className="form-textarea"
                  value={editingTask.description || ""}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Priority</label>
                <select
                  id="edit-task-priority-select"
                  className="form-select"
                  value={editingTask.priority}
                  onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value })}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Assignee</label>
                <select
                  id="edit-task-assignee-select"
                  className="form-select"
                  value={editingTask.assigneeId || ""}
                  onChange={(e) => setEditingTask({ ...editingTask, assigneeId: e.target.value || null })}
                >
                  <option value="">-- Unassigned --</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user?.name || m.user?.email} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-footer" style={{ justifyContent: "space-between" }}>
                <button
                  type="button"
                  className="btn-mini danger"
                  onClick={() => handleDeleteTask(editingTask.id)}
                >
                  Delete Task
                </button>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditingTask(null)}
                  >
                    Cancel
                  </button>
                  <button
                    id="submit-edit-task-btn"
                    type="submit"
                    className="btn-primary"
                    disabled={actionLoading}
                  >
                    {actionLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
