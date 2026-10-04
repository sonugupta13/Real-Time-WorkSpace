import { Router } from "express";
import { WorkspaceRole } from "@prisma/client";
import {
  createTask,
  getTaskById,
  updateTask,
  assignTask,
  moveTask,
  deleteTask,
} from "../controllers/task.controller";
import { searchAndFilterTasks } from "../controllers/search.controller";
import { requireWorkspaceRole } from "../middlewares/rbac.middleware";

export const taskRouter = Router({ mergeParams: true });

// Full-Text Search, Filtering & Pagination: OWNER, ADMIN, MEMBER, VIEWER
taskRouter.get(
  "/tasks/search",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  searchAndFilterTasks
);

// Read task: OWNER, ADMIN, MEMBER, VIEWER
taskRouter.get(
  "/tasks/:taskId",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  getTaskById
);

// Mutations: OWNER, ADMIN, MEMBER (VIEWER is rejected)
taskRouter.post(
  "/lists/:listId/tasks",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  createTask
);

taskRouter.patch(
  "/tasks/:taskId",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  updateTask
);

taskRouter.patch(
  "/tasks/:taskId/assign",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  assignTask
);

taskRouter.patch(
  "/tasks/:taskId/move",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  moveTask
);

taskRouter.delete(
  "/tasks/:taskId",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  deleteTask
);

export default taskRouter;
