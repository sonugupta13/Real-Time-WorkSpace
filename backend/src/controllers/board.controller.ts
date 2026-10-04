import { Request, Response } from "express";
import prisma from "../config/db";

// 1. Create Board
export async function createBoard(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { title, description } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({
        error: "BadRequest",
        message: "Board title is required",
      });
      return;
    }

    // Determine position (append after highest position)
    const highestBoard = await prisma.board.findFirst({
      where: { workspaceId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const position = highestBoard ? highestBoard.position + 1000 : 1000;

    const board = await prisma.$transaction(async (tx) => {
      const created = await tx.board.create({
        data: {
          workspaceId,
          title: title.trim(),
          description: description ? description.trim() : null,
          position,
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "BOARD_CREATED",
          entityType: "BOARD",
          entityId: created.id,
          metadata: { title: created.title },
        },
      });

      return created;
    });

    res.status(201).json({
      message: "Board created successfully",
      board,
    });
  } catch (error: any) {
    console.error("[Board] Create error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to create board",
    });
  }
}

// 2. List Boards in Workspace
export async function getBoards(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;

    const boards = await prisma.board.findMany({
      where: { workspaceId },
      orderBy: { position: "asc" },
      include: {
        _count: {
          select: { lists: true },
        },
      },
    });

    res.status(200).json({ boards });
  } catch (error: any) {
    console.error("[Board] List error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to retrieve boards",
    });
  }
}

// 3. Get Single Board with its Ordered Lists and Ordered Tasks
export async function getBoardById(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const boardId = req.params.boardId as string;

    const board = await prisma.board.findFirst({
      where: { id: boardId, workspaceId },
      include: {
        lists: {
          orderBy: { position: "asc" },
          include: {
            tasks: {
              orderBy: { position: "asc" },
              include: {
                assignee: {
                  select: { id: true, name: true, email: true, avatarUrl: true },
                },
                creator: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    if (!board) {
      res.status(404).json({
        error: "NotFound",
        message: "Board not found in this workspace",
      });
      return;
    }

    res.status(200).json({ board });
  } catch (error: any) {
    console.error("[Board] Get error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to retrieve board",
    });
  }
}

// 4. Update Board
export async function updateBoard(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const boardId = req.params.boardId as string;
    const { title, description, position } = req.body;

    const existingBoard = await prisma.board.findFirst({
      where: { id: boardId, workspaceId },
    });

    if (!existingBoard) {
      res.status(404).json({
        error: "NotFound",
        message: "Board not found in this workspace",
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const board = await tx.board.update({
        where: { id: boardId },
        data: {
          title: title !== undefined ? title.trim() : undefined,
          description: description !== undefined ? description?.trim() : undefined,
          position: typeof position === "number" ? position : undefined,
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "BOARD_UPDATED",
          entityType: "BOARD",
          entityId: board.id,
          metadata: { title: board.title },
        },
      });

      return board;
    });

    res.status(200).json({
      message: "Board updated successfully",
      board: updated,
    });
  } catch (error: any) {
    console.error("[Board] Update error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to update board",
    });
  }
}

// 5. Delete Board
export async function deleteBoard(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const boardId = req.params.boardId as string;

    const existingBoard = await prisma.board.findFirst({
      where: { id: boardId, workspaceId },
    });

    if (!existingBoard) {
      res.status(404).json({
        error: "NotFound",
        message: "Board not found in this workspace",
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.board.delete({
        where: { id: boardId },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "BOARD_DELETED",
          entityType: "BOARD",
          entityId: boardId,
          metadata: { title: existingBoard.title },
        },
      });
    });

    res.status(200).json({
      message: "Board deleted successfully",
    });
  } catch (error: any) {
    console.error("[Board] Delete error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to delete board",
    });
  }
}
