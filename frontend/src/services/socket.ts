import { io, Socket } from "socket.io-client";

let socketInstance: Socket | null = null;
let currentJoinedBoardId: string | null = null;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:5000";

export function getSocket(token: string): Socket {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  // Create new socket connection with JWT auth
  socketInstance = io(WS_URL, {
    auth: { token: `Bearer ${token}` },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socketInstance.on("connect", () => {
    console.log("[WebSocket] Connected to server:", socketInstance?.id);
    if (currentJoinedBoardId) {
      // Re-join active room on reconnect
      socketInstance?.emit("join:board", { boardId: currentJoinedBoardId });
    }
  });

  socketInstance.on("connect_error", (err) => {
    console.warn("[WebSocket] Connection error:", err.message);
  });

  socketInstance.on("disconnect", (reason) => {
    console.log("[WebSocket] Disconnected:", reason);
  });

  return socketInstance;
}

export function joinBoardRoom(socket: Socket, workspaceId: string, boardId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (currentJoinedBoardId && currentJoinedBoardId !== boardId) {
      socket.emit("leave:board", { boardId: currentJoinedBoardId });
    }

    currentJoinedBoardId = boardId;

    socket.emit("join:board", { workspaceId, boardId }, (res: any) => {
      if (res && res.error) {
        console.warn("[WebSocket] Failed to join board room:", res.error);
        resolve(false);
      } else {
        console.log(`[WebSocket] Successfully joined room board:${boardId}`);
        resolve(true);
      }
    });
  });
}

export function leaveBoardRoom(socket: Socket, boardId: string) {
  if (currentJoinedBoardId === boardId) {
    socket.emit("leave:board", { boardId });
    currentJoinedBoardId = null;
  }
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    currentJoinedBoardId = null;
  }
}
