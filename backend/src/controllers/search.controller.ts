import { Request, Response } from "express";
import { Prisma, TaskPriority } from "@prisma/client";
import prisma from "../config/db";

// GET /api/v1/workspaces/:workspaceId/tasks/search
export async function searchAndFilterTasks(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;

    const {
      q,
      assigneeId,
      label,
      status,
      priority,
      boardId,
      page: pageQuery,
      limit: limitQuery,
      sortBy = "position",
      sortOrder = "asc",
    } = req.query;

    const page = Math.max(1, parseInt(pageQuery as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(limitQuery as string, 10) || 10));
    const skip = (page - 1) * limit;

    // 1. Mandatory Workspace Tenant Isolation Boundary
    const where: Prisma.TaskWhereInput = {
      workspaceId,
    };

    // 2. Full-Text Search over Title and Description
    if (q && typeof q === "string" && q.trim().length > 0) {
      const searchTerm = q.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // 3. Filter by Assignee
    if (assigneeId && typeof assigneeId === "string") {
      if (assigneeId.toLowerCase() === "unassigned") {
        where.assigneeId = null;
      } else {
        where.assigneeId = assigneeId;
      }
    }

    // 4. Filter by Label
    if (label && typeof label === "string" && label.trim().length > 0) {
      where.label = { equals: label.trim(), mode: "insensitive" };
    }

    // 5. Filter by Priority
    if (
      priority &&
      typeof priority === "string" &&
      Object.values(TaskPriority).includes(priority.toUpperCase() as TaskPriority)
    ) {
      where.priority = priority.toUpperCase() as TaskPriority;
    }

    // 6. Filter by Status (List title or List ID) & Board ID Scoping
    const listConditions: Prisma.ListWhereInput = {};
    if (status && typeof status === "string" && status.trim().length > 0) {
      const statusTerm = status.trim();
      listConditions.OR = [
        { id: statusTerm },
        { title: { contains: statusTerm, mode: "insensitive" } },
      ];
    }

    if (boardId && typeof boardId === "string" && boardId.trim().length > 0) {
      listConditions.boardId = boardId.trim();
    }

    if (Object.keys(listConditions).length > 0) {
      where.list = listConditions;
    }

    // 7. Dynamic Sorting
    const allowedSortFields = ["position", "createdAt", "dueDate", "priority", "title"];
    const sortField = allowedSortFields.includes(sortBy as string) ? (sortBy as string) : "position";
    const orderDirection = (sortOrder as string).toLowerCase() === "desc" ? "desc" : "asc";

    const orderBy: Prisma.TaskOrderByWithRelationInput = {
      [sortField]: orderDirection,
    };

    // 8. Execute Count and Paginated Query inside an isolated transaction
    const [total, tasks] = await prisma.$transaction([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          list: {
            select: { id: true, title: true, boardId: true },
          },
          assignee: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          creator: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      appliedFilters: {
        q: q || null,
        assigneeId: assigneeId || null,
        label: label || null,
        status: status || null,
        priority: priority || null,
        boardId: boardId || null,
      },
    });
  } catch (error: any) {
    console.error("[Search] Query error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to execute search and filter query",
    });
  }
}
