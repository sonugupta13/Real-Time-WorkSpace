import { Request, Response } from "express";
import { exportQueue } from "../queues/export.queue";
import prisma from "../config/db";

// POST /api/v1/workspaces/:workspaceId/boards/:boardId/export
// Asynchronous HTTP trigger: enqueues BullMQ job and returns immediately (202 Accepted)
export async function triggerBoardExport(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const boardId = req.params.boardId as string;
    const userId = req.user!.id;

    // Verify board belongs to workspace
    const board = await prisma.board.findFirst({
      where: { id: boardId, workspaceId },
      select: { id: true, title: true },
    });

    if (!board) {
      res.status(404).json({
        error: "NotFound",
        message: "Board not found in this workspace",
      });
      return;
    }

    try {
      // Enqueue job into Redis-backed BullMQ
      const job = await exportQueue.add(
        "export-board",
        {
          boardId,
          workspaceId,
          requestedByUserId: userId,
        },
        {
          jobId: `export-${boardId}-${Date.now()}`,
        }
      );

      res.status(202).json({
        message: "Board export job queued successfully",
        jobId: job.id,
        status: "queued",
        statusUrl: `/api/v1/workspaces/${workspaceId}/boards/${boardId}/export/${job.id}`,
      });
    } catch (queueErr: any) {
      // Dependency failure handling: Redis or queue worker unavailable
      console.error("[Queue Dependency Error]:", queueErr.message);
      res.status(503).json({
        error: "ServiceUnavailable",
        message: "Background job processing service is temporarily unavailable. Please retry shortly.",
      });
    }
  } catch (error: any) {
    console.error("[Export Controller Error]:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to queue export job",
    });
  }
}

// GET /api/v1/workspaces/:workspaceId/boards/:boardId/export/:jobId
// Pollable job status / result endpoint
export async function getBoardExportStatus(req: Request, res: Response): Promise<void> {
  try {
    const jobId = req.params.jobId as string;

    try {
      const job = await exportQueue.getJob(jobId);

      if (!job) {
        res.status(404).json({
          error: "NotFound",
          message: "Export job not found or expired from history",
        });
        return;
      }

      const state = await job.getState();
      const progress = job.progress;

      if (state === "completed") {
        res.status(200).json({
          jobId: job.id,
          status: "completed",
          progress: 100,
          completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          result: job.returnvalue,
        });
        return;
      }

      if (state === "failed") {
        res.status(200).json({
          jobId: job.id,
          status: "failed",
          failedReason: job.failedReason || "Export failed during processing",
        });
        return;
      }

      // In progress / queued state
      res.status(200).json({
        jobId: job.id,
        status: state,
        progress: typeof progress === "number" ? progress : 0,
      });
    } catch (queueErr: any) {
      console.error("[Queue Status Error]:", queueErr.message);
      res.status(503).json({
        error: "ServiceUnavailable",
        message: "Unable to reach queue service to inspect job status",
      });
    }
  } catch (error: any) {
    console.error("[Export Status Error]:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to inspect export job status",
    });
  }
}
