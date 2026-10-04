import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes";
import workspaceRouter from "./routes/workspace.routes";

export const app = express();

// Middlewares
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic Health Check Endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "workspace-backend",
  });
});

// API v1 Health Check
app.get("/api/v1/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  });
});

// Authentication Routes
app.use("/api/v1/auth", authRouter);

// Workspace & RBAC Routes
app.use("/api/v1/workspaces", workspaceRouter);

// 404 Catch-All Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: "Requested API endpoint does not exist",
  });
});

// Global Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ServerError]:", err.message);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "production" ? "Something went wrong" : err.message,
  });
});

export default app;
