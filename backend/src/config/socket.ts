import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/token";
import prisma from "./db";

let io: Server | null = null;

export interface SocketUser {
  id: string;
  email: string;
}

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      methods: ["GET", "POST", "PATCH", "DELETE"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // 1. WebSocket Authentication Handshake Middleware
  io.use(async (socket: Socket, next) => {
    try {
      const authHeader =
        socket.handshake.auth?.token || socket.handshake.headers?.authorization;

      if (!authHeader) {
        return next(new Error("Authentication error: No token provided"));
      }

      const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;

      const decoded = verifyAccessToken(token);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true },
      });

      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      socket.data.user = user;
      next();
    } catch {
      next(new Error("Authentication error: Invalid or expired token"));
    }
  });

  // 2. Client Connection & Room Management
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as SocketUser;
    console.log(`[Socket] User connected: ${user.email} (socket id: ${socket.id})`);

    // Join Board Room (Scoped with Workspace Membership Check)
    socket.on("join:board", async (data: { workspaceId: string; boardId: string }, callback) => {
      try {
        const { workspaceId, boardId } = data;

        if (!workspaceId || !boardId) {
          if (typeof callback === "function") {
            callback({ error: "workspaceId and boardId are required" });
          }
          return;
        }

        // Verify user is a member of the workspace
        const membership = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId,
              userId: user.id,
            },
          },
        });

        if (!membership) {
          if (typeof callback === "function") {
            callback({ error: "Access denied: Not a member of this workspace" });
          }
          return;
        }

        // Verify board belongs to workspace
        const board = await prisma.board.findFirst({
          where: { id: boardId, workspaceId },
        });

        if (!board) {
          if (typeof callback === "function") {
            callback({ error: "Board does not exist in this workspace" });
          }
          return;
        }

        const room = `board:${boardId}`;
        socket.join(room);
        console.log(`[Socket] ${user.email} joined room: ${room}`);

        if (typeof callback === "function") {
          callback({ success: true, room });
        }
      } catch (err: any) {
        if (typeof callback === "function") {
          callback({ error: "Failed to join board room" });
        }
      }
    });

    // Leave Board Room
    socket.on("leave:board", (data: { boardId: string }) => {
      if (data?.boardId) {
        const room = `board:${data.boardId}`;
        socket.leave(room);
        console.log(`[Socket] ${user.email} left room: ${room}`);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket] User disconnected: ${user.email} (${reason})`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO has not been initialized. Call initSocket first.");
  }
  return io;
}

// Scoped Broadcast to Board Room
export function emitToBoard(boardId: string, event: string, payload: any): void {
  if (io) {
    io.to(`board:${boardId}`).emit(event, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}

// Scoped Broadcast to Workspace Room
export function emitToWorkspace(workspaceId: string, event: string, payload: any): void {
  if (io) {
    io.to(`workspace:${workspaceId}`).emit(event, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}
