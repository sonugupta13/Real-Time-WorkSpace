import { Router } from "express";
import { WorkspaceRole } from "@prisma/client";
import {
  createWorkspace,
  getWorkspace,
  getUserWorkspaces,
  inviteMember,
  listMembers,
  updateMemberRole,
  removeMember,
} from "../controllers/workspace.controller";
import { getWorkspaceSummary } from "../controllers/summary.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requireWorkspaceRole } from "../middlewares/rbac.middleware";
import boardRouter from "./board.routes";
import listRouter from "./list.routes";
import taskRouter from "./task.routes";
import activityRouter from "./activity.routes";

export const workspaceRouter = Router();

// All workspace routes require an authenticated user
workspaceRouter.use(authenticate);

// Mount nested Board, List, Task, and Activity sub-routers scoped to /:workspaceId
workspaceRouter.use("/:workspaceId/boards", boardRouter);
workspaceRouter.use("/:workspaceId/activity", activityRouter);
workspaceRouter.use("/:workspaceId", listRouter);
workspaceRouter.use("/:workspaceId", taskRouter);

// 1. Create a new workspace
workspaceRouter.post("/", createWorkspace);

// 2. List all workspaces the authenticated user belongs to
workspaceRouter.get("/", getUserWorkspaces);

// 3. Get workspace details (OWNER, ADMIN, MEMBER, VIEWER)
workspaceRouter.get(
  "/:workspaceId",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  getWorkspace
);

// 3b. Get cached workspace summary & aggregated metrics (OWNER, ADMIN, MEMBER, VIEWER)
workspaceRouter.get(
  "/:workspaceId/summary",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  getWorkspaceSummary
);

// 4. List workspace members (OWNER, ADMIN, MEMBER, VIEWER)
workspaceRouter.get(
  "/:workspaceId/members",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  listMembers
);

// 5. Invite member by email (OWNER & ADMIN only)
workspaceRouter.post(
  "/:workspaceId/members",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]),
  inviteMember
);

// 6. Change member role (OWNER & ADMIN only)
workspaceRouter.patch(
  "/:workspaceId/members/:memberId",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]),
  updateMemberRole
);

// 7. Remove member (OWNER & ADMIN, or self-removal)
workspaceRouter.delete(
  "/:workspaceId/members/:memberId",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
  ]),
  removeMember
);

export default workspaceRouter;
