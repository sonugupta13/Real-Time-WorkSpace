import { Router } from "express";
import { WorkspaceRole } from "@prisma/client";
import {
  createBoard,
  getBoards,
  getBoardById,
  updateBoard,
  deleteBoard,
} from "../controllers/board.controller";
import { requireWorkspaceRole } from "../middlewares/rbac.middleware";

import {
  triggerBoardExport,
  getBoardExportStatus,
} from "../controllers/export.controller";

export const boardRouter = Router({ mergeParams: true });

// Read operations: OWNER, ADMIN, MEMBER, VIEWER
boardRouter.get(
  "/",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  getBoards
);

boardRouter.get(
  "/:boardId",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  getBoardById
);

// Asynchronous Background Job Processing (BullMQ)
boardRouter.post(
  "/:boardId/export",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  triggerBoardExport
);

boardRouter.get(
  "/:boardId/export/:jobId",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  getBoardExportStatus
);

// Mutation operations: OWNER, ADMIN, MEMBER (VIEWER is rejected)
boardRouter.post(
  "/",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  createBoard
);

boardRouter.patch(
  "/:boardId",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  updateBoard
);

boardRouter.delete(
  "/:boardId",
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER]),
  deleteBoard
);

export default boardRouter;
