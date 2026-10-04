import { Request, Response } from "express";
import crypto from "crypto";
import { WorkspaceRole } from "@prisma/client";
import prisma from "../config/db";

// Helper to generate a URL-safe unique slug
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base || "workspace"}-${suffix}`;
}

// 1. Create Workspace (Caller automatically becomes OWNER)
export async function createWorkspace(req: Request, res: Response): Promise<void> {
  try {
    const { name, description } = req.body;
    const userId = req.user!.id;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({
        error: "BadRequest",
        message: "Workspace name is required",
      });
      return;
    }

    const slug = generateSlug(name);

    // Atomically create Workspace, assign OWNER membership, and log activity
    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: name.trim(),
          slug,
          description: description ? description.trim() : null,
          ownerId: userId,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: created.id,
          userId,
          role: WorkspaceRole.OWNER,
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId: created.id,
          userId,
          action: "WORKSPACE_CREATED",
          entityType: "WORKSPACE",
          entityId: created.id,
          metadata: { name: created.name },
        },
      });

      return created;
    });

    res.status(201).json({
      message: "Workspace created successfully",
      workspace,
    });
  } catch (error: any) {
    console.error("[Workspace] Create error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to create workspace",
    });
  }
}

// 2. Get Workspace Details (Scoped by tenant membership)
export async function getWorkspace(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        _count: {
          select: {
            members: true,
            boards: true,
          },
        },
      },
    });

    if (!workspace) {
      res.status(404).json({
        error: "NotFound",
        message: "Workspace not found",
      });
      return;
    }

    res.status(200).json({
      workspace: {
        ...workspace,
        userRole: req.workspaceMember?.role,
      },
    });
  } catch (error: any) {
    console.error("[Workspace] Get error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to retrieve workspace",
    });
  }
}

// 3. List all workspaces the authenticated user is a member of
export async function getUserWorkspaces(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            owner: {
              select: { id: true, name: true, email: true },
            },
            _count: {
              select: { members: true, boards: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const workspaces = memberships.map((m) => ({
      ...m.workspace,
      userRole: m.role,
      joinedAt: m.joinedAt,
    }));

    res.status(200).json({ workspaces });
  } catch (error: any) {
    console.error("[Workspace] List error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to fetch user workspaces",
    });
  }
}

// 4. Invite user by email (OWNER & ADMIN only)
export async function inviteMember(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { email, role = WorkspaceRole.MEMBER } = req.body;
    const currentUserRole = req.workspaceMember!.role;

    if (!email || typeof email !== "string") {
      res.status(400).json({
        error: "BadRequest",
        message: "A valid email is required to invite a member",
      });
      return;
    }

    // Role validation
    if (!Object.values(WorkspaceRole).includes(role) || role === WorkspaceRole.OWNER) {
      res.status(400).json({
        error: "BadRequest",
        message: "Invalid invitation role. Choose ADMIN, MEMBER, or VIEWER",
      });
      return;
    }

    // ADMIN cannot invite someone as ADMIN
    if (currentUserRole === WorkspaceRole.ADMIN && role === WorkspaceRole.ADMIN) {
      res.status(403).json({
        error: "Forbidden",
        message: "Only the workspace OWNER can invite or assign the ADMIN role",
      });
      return;
    }

    // Find target user in database
    const targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!targetUser) {
      res.status(404).json({
        error: "NotFound",
        message: `User with email "${email}" does not exist. They must register first.`,
      });
      return;
    }

    // Check if user is already a member
    const existingMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: targetUser.id,
        },
      },
    });

    if (existingMembership) {
      res.status(409).json({
        error: "Conflict",
        message: "User is already a member of this workspace",
      });
      return;
    }

    // Create membership & log activity
    const newMember = await prisma.$transaction(async (tx) => {
      const created = await tx.workspaceMember.create({
        data: {
          workspaceId,
          userId: targetUser.id,
          role,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "MEMBER_INVITED",
          entityType: "MEMBER",
          entityId: created.id,
          metadata: { invitedUserId: targetUser.id, role },
        },
      });

      return created;
    });

    res.status(201).json({
      message: "Member successfully invited",
      member: newMember,
    });
  } catch (error: any) {
    console.error("[Workspace] Invite error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to invite member",
    });
  }
}

// 5. List workspace members (OWNER, ADMIN, MEMBER, VIEWER)
export async function listMembers(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    res.status(200).json({ members });
  } catch (error: any) {
    console.error("[Workspace] List members error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to retrieve members",
    });
  }
}

// 6. Change member role (OWNER & ADMIN only)
export async function updateMemberRole(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const memberId = req.params.memberId as string;
    const { role } = req.body;
    const currentUserRole = req.workspaceMember!.role;

    if (!role || !Object.values(WorkspaceRole).includes(role) || role === WorkspaceRole.OWNER) {
      res.status(400).json({
        error: "BadRequest",
        message: "Invalid target role. Must be ADMIN, MEMBER, or VIEWER",
      });
      return;
    }

    const targetMember = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.workspaceId !== workspaceId) {
      res.status(404).json({
        error: "NotFound",
        message: "Member not found in this workspace",
      });
      return;
    }

    // Owner protection: cannot change role of OWNER
    if (targetMember.role === WorkspaceRole.OWNER) {
      res.status(403).json({
        error: "Forbidden",
        message: "Cannot modify the role of the workspace OWNER",
      });
      return;
    }

    // Admin boundaries:
    if (currentUserRole === WorkspaceRole.ADMIN) {
      // Admin cannot promote to ADMIN
      if (role === WorkspaceRole.ADMIN) {
        res.status(403).json({
          error: "Forbidden",
          message: "Only the OWNER can promote members to ADMIN",
        });
        return;
      }
      // Admin cannot change another ADMIN's role
      if (targetMember.role === WorkspaceRole.ADMIN) {
        res.status(403).json({
          error: "Forbidden",
          message: "ADMIN cannot modify another ADMIN's role",
        });
        return;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const member = await tx.workspaceMember.update({
        where: { id: memberId },
        data: { role },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "MEMBER_ROLE_UPDATED",
          entityType: "MEMBER",
          entityId: member.id,
          metadata: { previousRole: targetMember.role, newRole: role },
        },
      });

      return member;
    });

    res.status(200).json({
      message: "Member role updated successfully",
      member: updated,
    });
  } catch (error: any) {
    console.error("[Workspace] Update role error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to update member role",
    });
  }
}

// 7. Remove member (OWNER & ADMIN only, or self-removal)
export async function removeMember(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const memberId = req.params.memberId as string;
    const currentUserRole = req.workspaceMember!.role;
    const currentUserId = req.user!.id;

    const targetMember = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.workspaceId !== workspaceId) {
      res.status(404).json({
        error: "NotFound",
        message: "Member not found in this workspace",
      });
      return;
    }

    // Cannot remove the workspace OWNER
    if (targetMember.role === WorkspaceRole.OWNER) {
      res.status(403).json({
        error: "Forbidden",
        message: "The workspace OWNER cannot be removed",
      });
      return;
    }

    const isSelfRemoval = targetMember.userId === currentUserId;

    // If not self-removal, check ADMIN constraints
    if (!isSelfRemoval && currentUserRole === WorkspaceRole.ADMIN) {
      if (targetMember.role === WorkspaceRole.ADMIN) {
        res.status(403).json({
          error: "Forbidden",
          message: "ADMIN cannot remove another ADMIN",
        });
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspaceMember.delete({
        where: { id: memberId },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: currentUserId,
          action: isSelfRemoval ? "MEMBER_LEFT" : "MEMBER_REMOVED",
          entityType: "MEMBER",
          entityId: memberId,
          metadata: { removedUserId: targetMember.userId },
        },
      });
    });

    res.status(200).json({
      message: isSelfRemoval ? "You have left the workspace" : "Member removed successfully",
    });
  } catch (error: any) {
    console.error("[Workspace] Remove member error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to remove member",
    });
  }
}
