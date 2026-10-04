import { Router } from "express";
import { WorkspaceRole } from "@prisma/client";
import {
  createList,
  getLists,
  updateList,
  moveList,
  deleteList,
} from "../controllers/list.controller";
import { requireWorkspaceRole } from "../middlewares/rbac.middleware";

export const listRouter = Router({ mergeParams: true });

// Read lists for a board: OWNER, ADMIN, MEMBER, VIEWER
listRouter.get(
  "/boards/:boardId/lists",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  getLists
);

// Mutations: OWNER, ADMIN, MEMBER (VIEWER is rejected)
listRouter.post(
  "/boards/:boardId/lists",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  createList
);

listRouter.patch(
  "/lists/:listId",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  updateList
);

listRouter.patch(
  "/lists/:listId/move",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  moveList
);

listRouter.delete(
  "/lists/:listId",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  deleteList
);

export default listRouter;
