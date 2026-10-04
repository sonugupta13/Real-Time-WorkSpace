import { Request, Response } from "express";
import prisma from "../config/db";

// GET /api/v1/workspaces/:workspaceId/activity
export async function getWorkspaceActivity(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const { entityType, action } = req.query;

    const where: any = {
      workspaceId, // Strict Workspace Tenant Isolation Guard
    };

    if (entityType && typeof entityType === "string") {
      where.entityType = entityType.toUpperCase().trim();
    }

    if (action && typeof action === "string") {
      where.action = action.toUpperCase().trim();
    }

    // Run count and query in parallel for fast, accurate pagination
    const [total, activities] = await prisma.$transaction([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      activities,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    console.error("[Activity] Get error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to retrieve workspace activities",
    });
  }
}
