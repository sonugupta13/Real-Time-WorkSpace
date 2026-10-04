import { Request, Response } from "express";
import { TaskPriority } from "@prisma/client";
import prisma from "../config/db";
import { calculatePosition } from "./list.controller";
import { emitToBoard } from "../config/socket";
import { invalidateWorkspaceSummaryCache } from "./summary.controller";

// 1. Create Task in List
export async function createTask(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const listId = req.params.listId as string;
    const { title, description, priority = TaskPriority.MEDIUM, dueDate, assigneeId } = req.body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({
        error: "BadRequest",
        message: "Task title is required",
      });
      return;
    }

    // Verify list belongs to workspace
    const list = await prisma.list.findFirst({
      where: { id: listId, workspaceId },
    });

    if (!list) {
      res.status(404).json({
        error: "NotFound",
        message: "List not found in this workspace",
      });
      return;
    }

    // Verify assignee if provided
    if (assigneeId) {
      const isMember = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: assigneeId,
          },
        },
      });

      if (!isMember) {
        res.status(400).json({
          error: "BadRequest",
          message: "Assignee must be a member of this workspace",
        });
        return;
      }
    }

    // Determine position: append after highest task in this list
    const highestTask = await prisma.task.findFirst({
      where: { listId, workspaceId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const position = highestTask ? highestTask.position + 1000 : 1000;

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          workspaceId,
          listId,
          title: title.trim(),
          description: description ? description.trim() : null,
          priority: Object.values(TaskPriority).includes(priority) ? priority : TaskPriority.MEDIUM,
          dueDate: dueDate ? new Date(dueDate) : null,
          assigneeId: assigneeId || null,
          creatorId: req.user!.id,
          position,
        },
        include: {
          assignee: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          creator: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "TASK_CREATED",
          entityType: "TASK",
          entityId: created.id,
          metadata: { title: created.title, listId },
        },
      });

      return created;
    });

    // Broadcast Real-Time WebSocket Event after DB mutation succeeds
    emitToBoard(list.boardId, "task:created", {
      task,
      boardId: list.boardId,
      listId,
    });

    // Invalidate cached workspace summary
    invalidateWorkspaceSummaryCache(workspaceId).catch(() => {});

    res.status(201).json({
      message: "Task created successfully",
      task,
    });
  } catch (error: any) {
    console.error("[Task] Create error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to create task",
    });
  }
}

// 2. Get Single Task Details
export async function getTaskById(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const taskId = req.params.taskId as string;

    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
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
    });

    if (!task) {
      res.status(404).json({
        error: "NotFound",
        message: "Task not found in this workspace",
      });
      return;
    }

    res.status(200).json({ task });
  } catch (error: any) {
    console.error("[Task] Get error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to retrieve task",
    });
  }
}

// 3. Update Task Properties
export async function updateTask(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const taskId = req.params.taskId as string;
    const { title, description, priority, dueDate } = req.body;

    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      include: {
        list: { select: { boardId: true } },
      },
    });

    if (!existingTask) {
      res.status(404).json({
        error: "NotFound",
        message: "Task not found in this workspace",
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: taskId },
        data: {
          title: title !== undefined ? title.trim() : undefined,
          description: description !== undefined ? description?.trim() : undefined,
          priority: Object.values(TaskPriority).includes(priority) ? priority : undefined,
          dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
        },
        include: {
          assignee: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "TASK_UPDATED",
          entityType: "TASK",
          entityId: task.id,
          metadata: { title: task.title },
        },
      });

      return task;
    });

    // Broadcast Real-Time Event after DB mutation succeeds
    emitToBoard(existingTask.list.boardId, "task:updated", {
      task: updated,
      boardId: existingTask.list.boardId,
      listId: updated.listId,
    });

    // Invalidate cached workspace summary
    invalidateWorkspaceSummaryCache(workspaceId).catch(() => {});

    res.status(200).json({
      message: "Task updated successfully",
      task: updated,
    });
  } catch (error: any) {
    console.error("[Task] Update error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to update task",
    });
  }
}

// 4. Assign / Unassign Task
export async function assignTask(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const taskId = req.params.taskId as string;
    const { assigneeId } = req.body;

    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      include: {
        list: { select: { boardId: true } },
      },
    });

    if (!existingTask) {
      res.status(404).json({
        error: "NotFound",
        message: "Task not found in this workspace",
      });
      return;
    }

    if (assigneeId) {
      const isMember = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: assigneeId,
          },
        },
      });

      if (!isMember) {
        res.status(400).json({
          error: "BadRequest",
          message: "Assignee must be an active member of this workspace",
        });
        return;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: taskId },
        data: { assigneeId: assigneeId || null },
        include: {
          assignee: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: assigneeId ? "TASK_ASSIGNED" : "TASK_UNASSIGNED",
          entityType: "TASK",
          entityId: task.id,
          metadata: { assigneeId },
        },
      });

      return task;
    });

    // Broadcast Real-Time Event after DB mutation succeeds
    emitToBoard(existingTask.list.boardId, "task:updated", {
      task: updated,
      boardId: existingTask.list.boardId,
      listId: updated.listId,
    });

    res.status(200).json({
      message: assigneeId ? "Task assigned successfully" : "Task unassigned successfully",
      task: updated,
    });
  } catch (error: any) {
    console.error("[Task] Assign error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to assign task",
    });
  }
}

// 5. Move Task Between Lists & Reorder (Atomic Drag-and-Drop)
export async function moveTask(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const taskId = req.params.taskId as string;
    const { targetListId, newPosition, prevPosition, nextPosition } = req.body;

    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      include: {
        list: { select: { boardId: true } },
      },
    });

    if (!existingTask) {
      res.status(404).json({
        error: "NotFound",
        message: "Task not found in this workspace",
      });
      return;
    }

    // If moving to another list, verify targetListId belongs to this workspace
    const destListId = targetListId || existingTask.listId;
    if (targetListId && targetListId !== existingTask.listId) {
      const destList = await prisma.list.findFirst({
        where: { id: targetListId, workspaceId },
      });

      if (!destList) {
        res.status(404).json({
          error: "NotFound",
          message: "Target list not found in this workspace",
        });
        return;
      }
    }

    // Calculate persistent target position
    let targetPosition: number;
    if (typeof newPosition === "number") {
      targetPosition = newPosition;
    } else {
      targetPosition = calculatePosition(prevPosition, nextPosition);
    }

    // Atomically execute position and list migration inside a PostgreSQL transaction
    const moved = await prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: taskId },
        data: {
          listId: destListId,
          position: targetPosition,
        },
        include: {
          assignee: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "TASK_MOVED",
          entityType: "TASK",
          entityId: taskId,
          metadata: {
            fromListId: existingTask.listId,
            toListId: destListId,
            newPosition: targetPosition,
          },
        },
      });

      return task;
    });

    // Broadcast Real-Time Event after DB mutation succeeds
    emitToBoard(existingTask.list.boardId, "task:moved", {
      task: moved,
      boardId: existingTask.list.boardId,
      fromListId: existingTask.listId,
      toListId: destListId,
      newPosition: targetPosition,
    });

    // Invalidate cached workspace summary
    invalidateWorkspaceSummaryCache(workspaceId).catch(() => {});

    res.status(200).json({
      message: "Task moved successfully",
      task: moved,
    });
  } catch (error: any) {
    console.error("[Task] Move error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to move task",
    });
  }
}

// 6. Delete Task
export async function deleteTask(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const taskId = req.params.taskId as string;

    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      include: {
        list: { select: { boardId: true } },
      },
    });

    if (!existingTask) {
      res.status(404).json({
        error: "NotFound",
        message: "Task not found in this workspace",
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.task.delete({
        where: { id: taskId },
      });

      await tx.activityLog.create({
        data: {
          workspaceId,
          userId: req.user!.id,
          action: "TASK_DELETED",
          entityType: "TASK",
          entityId: taskId,
          metadata: { title: existingTask.title },
        },
      });
    });

    // Broadcast Real-Time Event after DB mutation succeeds
    emitToBoard(existingTask.list.boardId, "task:deleted", {
      taskId,
      boardId: existingTask.list.boardId,
      listId: existingTask.listId,
    });

    // Invalidate cached workspace summary
    invalidateWorkspaceSummaryCache(workspaceId).catch(() => {});

    res.status(200).json({
      message: "Task deleted successfully",
    });
  } catch (error: any) {
    console.error("[Task] Delete error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to delete task",
    });
  }
}
