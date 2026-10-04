import { Router } from "express";
import { WorkspaceRole } from "@prisma/client";
import { getWorkspaceActivity } from "../controllers/activity.controller";
import { requireWorkspaceRole } from "../middlewares/rbac.middleware";

export const activityRouter = Router({ mergeParams: true });

// Read activity logs: OWNER, ADMIN, MEMBER, VIEWER
activityRouter.get(
  "/",
  requireWorkspaceRole([
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
    WorkspaceRole.MEMBER,
    WorkspaceRole.VIEWER,
  ]),
  getWorkspaceActivity
);

export default activityRouter;
