"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import AuthForm from "../components/AuthForm";
import WorkspaceHeader from "../components/WorkspaceHeader";
import KanbanBoard from "../components/KanbanBoard";
import MembersView from "../components/MembersView";
import SearchView from "../components/SearchView";
import ActivityLogView from "../components/ActivityLogView";
import ExportModal from "../components/ExportModal";
import { authApi, workspaceApi, memberApi, boardApi } from "../services/api";
import { getSocket, joinBoardRoom, leaveBoardRoom, disconnectSocket } from "../services/socket";

export default function App() {
  // Authentication & Profile State
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Workspace State
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("");
  const [userRole, setUserRole] = useState<"OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | null>(null);
  const [members, setMembers] = useState<any[]>([]);

  // Board State
  const [boards, setBoards] = useState<any[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>("");
  const [activeBoard, setActiveBoard] = useState<any | null>(null);

  // Active View / Tab
  const [activeTab, setActiveTab] = useState<"board" | "members" | "search" | "activity">("board");

  // Modals & Real-time State
  const [showCreateWsModal, setShowCreateWsModal] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [recentUpdatedTaskId, setRecentUpdatedTaskId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const socketRef = useRef<any>(null);

  // 1. Initial Auth Check on Mount
  useEffect(() => {
    const savedToken = localStorage.getItem("accessToken");
    const savedRefresh = localStorage.getItem("refreshToken");

    if (savedToken) {
      setToken(savedToken);
      setRefreshToken(savedRefresh);
      authApi.getMe(savedToken).then((res) => {
        if (res.data?.user) {
          setUser(res.data.user);
        } else {
          // Token expired or invalid
          handleLogout();
        }
        setAuthLoading(false);
      });
    } else {
      setAuthLoading(false);
    }
  }, []);

  // 2. Fetch User Workspaces on Auth
  const fetchWorkspaces = useCallback(async (authToken: string) => {
    const res = await workspaceApi.listMyWorkspaces(authToken);
    if (res.data?.workspaces) {
      setWorkspaces(res.data.workspaces);
      if (res.data.workspaces.length > 0 && !activeWorkspaceId) {
        setActiveWorkspaceId(res.data.workspaces[0].id);
      }
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (token) {
      fetchWorkspaces(token);
    }
  }, [token, fetchWorkspaces]);

  // 3. Load Active Workspace Data (Members, Role, Boards)
  const loadWorkspaceData = useCallback(async () => {
    if (!token || !activeWorkspaceId) return;

    // Load workspace details to identify user role
    const wsRes = await workspaceApi.getDetails(token, activeWorkspaceId);
    if (wsRes.data?.workspace) {
      const membership = wsRes.data.workspace.members?.find((m: any) => m.userId === user?.id);
      if (membership) {
        setUserRole(membership.role);
      }
    }

    // Load members
    const memRes = await memberApi.list(token, activeWorkspaceId);
    if (memRes.data?.members) {
      setMembers(memRes.data.members);
      // Double check role from members list if needed
      const currentMem = memRes.data.members.find((m: any) => m.userId === user?.id);
      if (currentMem) {
        setUserRole(currentMem.role);
      }
    }

    // Load boards
    const boardsRes = await boardApi.list(token, activeWorkspaceId);
    if (boardsRes.data?.boards) {
      setBoards(boardsRes.data.boards);
      if (boardsRes.data.boards.length > 0) {
        // If current active board is not in this workspace, select the first board
        const exists = boardsRes.data.boards.some((b: any) => b.id === activeBoardId);
        if (!exists) {
          setActiveBoardId(boardsRes.data.boards[0].id);
        }
      } else {
        setActiveBoardId("");
        setActiveBoard(null);
      }
    }
  }, [token, activeWorkspaceId, user?.id, activeBoardId]);

  useEffect(() => {
    if (token && activeWorkspaceId) {
      loadWorkspaceData();
    }
  }, [token, activeWorkspaceId, loadWorkspaceData]);

  // 4. Load Active Board Details
  const loadBoardDetails = useCallback(async () => {
    if (!token || !activeWorkspaceId || !activeBoardId) {
      setActiveBoard(null);
      return;
    }

    const res = await boardApi.getDetails(token, activeWorkspaceId, activeBoardId);
    if (res.data?.board) {
      setActiveBoard(res.data.board);
    }
  }, [token, activeWorkspaceId, activeBoardId]);

  useEffect(() => {
    if (token && activeWorkspaceId && activeBoardId) {
      loadBoardDetails();
    }
  }, [token, activeWorkspaceId, activeBoardId, loadBoardDetails]);

  // 5. Real-Time WebSockets Synchronization
  useEffect(() => {
    if (!token || !activeWorkspaceId || !activeBoardId) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    // Join board room
    joinBoardRoom(socket, activeWorkspaceId, activeBoardId).then((joined) => {
      if (joined) setSocketConnected(true);
    });

    // Handle real-time task mutations
    const handleTaskCreated = (payload: any) => {
      console.log("[Socket Event] task:created", payload);
      loadBoardDetails();
      if (payload.task?.id) {
        triggerCardFlash(payload.task.id);
      }
    };

    const handleTaskUpdated = (payload: any) => {
      console.log("[Socket Event] task:updated", payload);
      loadBoardDetails();
      if (payload.task?.id) {
        triggerCardFlash(payload.task.id);
      }
    };

    const handleTaskMoved = (payload: any) => {
      console.log("[Socket Event] task:moved", payload);
      loadBoardDetails();
      if (payload.task?.id) {
        triggerCardFlash(payload.task.id);
      }
    };

    const handleTaskDeleted = (payload: any) => {
      console.log("[Socket Event] task:deleted", payload);
      loadBoardDetails();
    };

    socket.on("task:created", handleTaskCreated);
    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:moved", handleTaskMoved);
    socket.on("task:deleted", handleTaskDeleted);

    return () => {
      leaveBoardRoom(socket, activeBoardId);
      socket.off("task:created", handleTaskCreated);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:moved", handleTaskMoved);
      socket.off("task:deleted", handleTaskDeleted);
    };
  }, [token, activeWorkspaceId, activeBoardId, loadBoardDetails]);

  function triggerCardFlash(taskId: string) {
    setRecentUpdatedTaskId(taskId);
    setTimeout(() => {
      setRecentUpdatedTaskId((prev) => (prev === taskId ? null : prev));
    }, 1800);
  }

  // Auth Success Handler
  function handleAuthSuccess(newAccessToken: string, newRefreshToken: string, newUser: any) {
    localStorage.setItem("accessToken", newAccessToken);
    localStorage.setItem("refreshToken", newRefreshToken);
    setToken(newAccessToken);
    setRefreshToken(newRefreshToken);
    setUser(newUser);
  }

  // Logout Handler
  function handleLogout() {
    if (token) {
      authApi.logout(token, refreshToken || undefined);
    }
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    disconnectSocket();
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId("");
    setActiveBoard(null);
  }

  // Create Workspace Form Submit
  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newWsName.trim()) return;

    const res = await workspaceApi.create(token, {
      name: newWsName.trim(),
      description: newWsDesc.trim() || undefined,
    });

    if (res.error) {
      setGlobalError(res.error);
    } else if (res.data?.workspace) {
      setNewWsName("");
      setNewWsDesc("");
      setShowCreateWsModal(false);
      await fetchWorkspaces(token);
      setActiveWorkspaceId(res.data.workspace.id);
    }
  }

  // --------------------------------------------------------
  // Render: Loading Screen
  // --------------------------------------------------------
  if (authLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div className="brand-dot" style={{ margin: "0 auto 12px", width: 14, height: 14 }} />
          <p style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Connecting to CollabSpace...</p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------
  // Render: Unauthenticated (Login / Signup)
  // --------------------------------------------------------
  if (!token || !user) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <AuthForm onAuthSuccess={handleAuthSuccess} />
      </main>
    );
  }

  // --------------------------------------------------------
  // Render: Authenticated Workspace App
  // --------------------------------------------------------
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Workspace Header & Nav */}
      <WorkspaceHeader
        user={user}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={(id) => {
          setActiveWorkspaceId(id);
          setActiveBoardId("");
          setActiveBoard(null);
        }}
        onOpenCreateWorkspaceModal={() => setShowCreateWsModal(true)}
        userRole={userRole}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onLogout={handleLogout}
        socketConnected={socketConnected}
      />

      {/* Main Content Area */}
      <main className="container" style={{ flexGrow: 1, paddingBottom: 48 }}>
        {globalError && (
          <div className="alert-banner alert-error" style={{ marginTop: 16 }}>
            <span>{globalError}</span>
            <button type="button" onClick={() => setGlobalError(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>✕</button>
          </div>
        )}

        {workspaces.length === 0 ? (
          <div className="cream-card" style={{ textAlign: "center", padding: "64px 24px", marginTop: 40 }}>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Welcome to CollabSpace, {user.name}!</h2>
            <p style={{ color: "var(--text-secondary)", margin: "12px 0 24px" }}>
              To get started, create your first multi-tenant workspace.
            </p>
            <button
              id="get-started-create-ws-btn"
              type="button"
              className="btn-primary"
              onClick={() => setShowCreateWsModal(true)}
            >
              + Create Workspace
            </button>
          </div>
        ) : (
          <>
            {activeTab === "board" && (
              <KanbanBoard
                workspaceId={activeWorkspaceId}
                token={token}
                boards={boards}
                activeBoard={activeBoard}
                onSelectBoard={setActiveBoardId}
                onRefreshBoard={loadBoardDetails}
                userRole={userRole}
                members={members}
                onOpenExportModal={() => setShowExportModal(true)}
                recentUpdatedTaskId={recentUpdatedTaskId}
              />
            )}

            {activeTab === "members" && (
              <MembersView
                workspaceId={activeWorkspaceId}
                token={token}
                members={members}
                userRole={userRole}
                currentUserId={user.id}
                onRefreshMembers={loadWorkspaceData}
              />
            )}

            {activeTab === "search" && (
              <SearchView
                workspaceId={activeWorkspaceId}
                token={token}
                members={members}
              />
            )}

            {activeTab === "activity" && (
              <ActivityLogView
                workspaceId={activeWorkspaceId}
                token={token}
              />
            )}
          </>
        )}
      </main>

      {/* ---------------------------------------------------- */}
      {/* Modal: Create Workspace */}
      {/* ---------------------------------------------------- */}
      {showCreateWsModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create Multi-Tenant Workspace</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateWsModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateWorkspace}>
              <div className="form-group">
                <label className="form-label">Workspace Name</label>
                <input
                  id="new-workspace-name-input"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Acme Corp Engineering"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <textarea
                  id="new-workspace-desc-input"
                  className="form-textarea"
                  placeholder="Workspace purpose and team scope..."
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateWsModal(false)}
                >
                  Cancel
                </button>
                <button
                  id="submit-create-workspace-btn"
                  type="submit"
                  className="btn-primary"
                >
                  Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* Modal: Asynchronous Board Export (BullMQ + Redis) */}
      {/* ---------------------------------------------------- */}
      {showExportModal && activeBoard && (
        <ExportModal
          workspaceId={activeWorkspaceId}
          boardId={activeBoard.id}
          boardTitle={activeBoard.title}
          token={token}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Footer */}
      <footer className="site-footer">
        <div className="container">
          <p>© 2026 CollabSpace • Real-Time Collaborative Workspace with RBAC • Multi-Tenant Architecture</p>
        </div>
      </footer>
    </div>
  );
}
