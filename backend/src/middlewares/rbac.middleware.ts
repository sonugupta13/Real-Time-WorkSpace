import { Request, Response, NextFunction } from "express";
import { WorkspaceRole, WorkspaceMember } from "@prisma/client";
import prisma from "../config/db";
import "../types/express";

// Extend Express Request type to include workspace context
declare global {
  namespace Express {
    interface Request {
      workspaceMember?: WorkspaceMember;
      workspaceId?: string;
    }
  }
}

/**
 * Server-Side RBAC Middleware
 * Enforces:
 * 1. Authenticated user presence
 * 2. Active membership within the targeted workspace
 * 3. Required role hierarchy/permissions
 */
export function requireWorkspaceRole(allowedRoles: WorkspaceRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const workspaceId = (req.params.workspaceId || (req.body && req.body.workspaceId)) as string;

      if (!userId) {
        res.status(401).json({
          error: "Unauthorized",
          message: "Authentication required before accessing workspace resources",
        });
        return;
      }

      if (!workspaceId) {
        res.status(400).json({
          error: "BadRequest",
          message: "Workspace ID parameter is required",
        });
        return;
      }

      // Query membership for strict tenant isolation
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
      });

      // Strict boundary: If not a member, reject with 403 Forbidden
      if (!member) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have access to this workspace",
        });
        return;
      }

      // Check role authorization
      if (!allowedRoles.includes(member.role)) {
        res.status(403).json({
          error: "Forbidden",
          message: `Insufficient permissions. Requires one of [${allowedRoles.join(", ")}], but your role is ${member.role}`,
        });
        return;
      }

      // Attach workspace context to request
      req.workspaceMember = member;
      req.workspaceId = workspaceId;

      next();
    } catch (error: any) {
      console.error("[RBAC Middleware Error]:", error.message);
      res.status(500).json({
        error: "InternalServerError",
        message: "Failed to verify workspace permissions",
      });
    }
  };
}
