import { Request, Response } from "express";
import prisma from "../config/db";

// Helper: Compute fractional position for robust concurrent ordering
export function calculatePosition(
  prevPosition?: number | null,
  nextPosition?: number | null
): number {
  if (prevPosition != null && nextPosition != null) {
    return (prevPosition + nextPosition) / 2;
  }
  if (prevPosition != null && nextPosition == null) {
    return prevPosition + 1000;
  }
  if (prevPosition == null && nextPosition != null) {
    return nextPosition / 2;
  }
  return 1000;
}

// 1. Create List in Board
export async function createList(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const boardId = req.params.boardId as string;
    const { title } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({
        error: "BadRequest",
        message: "List title is required",
      });
      return;
    }

    // Verify board belongs to workspace
    const board = await prisma.board.findFirst({
      where: { id: boardId, workspaceId },
    });

    if (!board) {
      res.status(404).json({
        error: "NotFound",
        message: "Board not found in this workspace",
      });
      return;
    }

    // Determine position: append after highest existing list
    const highestList = await prisma.list.findFirst({
      where: { boardId, workspaceId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const position = highestList ? highestList.position + 1000 : 1000;

    const list = await prisma.$transaction(async (tx) => {
      const created = await tx.list.create({
        data: {
          workspaceId,
          boardId,
          title: title.trim(),
          position,
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "LIST_CREATED",
          entityType: "LIST",
          entityId: created.id,
          metadata: { title: created.title, boardId },
        },
      });

      return created;
    });

    res.status(201).json({
      message: "List created successfully",
      list,
    });
  } catch (error: any) {
    console.error("[List] Create error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to create list",
    });
  }
}

// 2. Get Lists for a Board
export async function getLists(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const boardId = req.params.boardId as string;

    const lists = await prisma.list.findMany({
      where: { boardId, workspaceId },
      orderBy: { position: "asc" },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
    });

    res.status(200).json({ lists });
  } catch (error: any) {
    console.error("[List] Get error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to retrieve lists",
    });
  }
}

// 3. Update List Title
export async function updateList(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const listId = req.params.listId as string;
    const { title } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({
        error: "BadRequest",
        message: "List title is required",
      });
      return;
    }

    const existingList = await prisma.list.findFirst({
      where: { id: listId, workspaceId },
    });

    if (!existingList) {
      res.status(404).json({
        error: "NotFound",
        message: "List not found in this workspace",
      });
      return;
    }

    const updated = await prisma.list.update({
      where: { id: listId },
      data: { title: title.trim() },
    });

    res.status(200).json({
      message: "List updated successfully",
      list: updated,
    });
  } catch (error: any) {
    console.error("[List] Update error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to update list",
    });
  }
}

// 4. Move / Reorder List
export async function moveList(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const listId = req.params.listId as string;
    const { newPosition, prevPosition, nextPosition } = req.body;

    const existingList = await prisma.list.findFirst({
      where: { id: listId, workspaceId },
    });

    if (!existingList) {
      res.status(404).json({
        error: "NotFound",
        message: "List not found in this workspace",
      });
      return;
    }

    // Compute target position
    let targetPosition: number;
    if (typeof newPosition === "number") {
      targetPosition = newPosition;
    } else {
      targetPosition = calculatePosition(prevPosition, nextPosition);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const list = await tx.list.update({
        where: { id: listId },
        data: { position: targetPosition },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "LIST_REORDERED",
          entityType: "LIST",
          entityId: listId,
          metadata: { newPosition: targetPosition },
        },
      });

      return list;
    });

    res.status(200).json({
      message: "List reordered successfully",
      list: updated,
    });
  } catch (error: any) {
    console.error("[List] Move error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to reorder list",
    });
  }
}

// 5. Delete List
export async function deleteList(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const listId = req.params.listId as string;

    const existingList = await prisma.list.findFirst({
      where: { id: listId, workspaceId },
    });

    if (!existingList) {
      res.status(404).json({
        error: "NotFound",
        message: "List not found in this workspace",
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.list.delete({
        where: { id: listId },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "LIST_DELETED",
          entityType: "LIST",
          entityId: listId,
          metadata: { title: existingList.title },
        },
      });
    });

    res.status(200).json({
      message: "List deleted successfully",
    });
  } catch (error: any) {
    console.error("[List] Delete error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to delete list",
    });
  }
}
