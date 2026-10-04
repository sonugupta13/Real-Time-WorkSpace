import http from "http";
import dotenv from "dotenv";

// Load environment variables before importing app and db
dotenv.config();

import app from "./app";
import { initSocket } from "./config/socket";

const PORT = process.env.PORT || 5000;

// Create standard HTTP server instance and bind Socket.IO
const server = http.createServer(app);
export const io = initSocket(server);

server.listen(PORT, () => {
  console.log(`[Server] Workspace backend running on http://localhost:${PORT}`);
  console.log(`[Server] Health check available at http://localhost:${PORT}/health`);
});

// Process-level error handling
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Process] Uncaught Exception:", error);
  process.exit(1);
});

export default server;
