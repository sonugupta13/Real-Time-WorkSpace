import { Queue, Worker, Job } from "bullmq";
import { getBullMQConnectionOptions } from "../config/redis";
import prisma from "../config/db";

export interface BoardExportJobData {
  boardId: string;
  workspaceId: string;
  requestedByUserId: string;
}

export interface BoardExportJobResult {
  boardId: string;
  title: string;
  workspaceId: string;
  exportedAt: string;
  summary: {
    listsCount: number;
    tasksCount: number;
  };
  exportData: any;
}

const connection = getBullMQConnectionOptions();

// 1. BullMQ Queue Instance
export const exportQueue = new Queue("board-export", {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 100,
    },
    removeOnFail: {
      age: 7200, // Keep failed jobs for 2 hours for debugging
    },
  },
});

// 2. BullMQ Background Worker Processor
export const exportWorker = new Worker(
  "board-export",
  async (job: Job) => {
    const { boardId, workspaceId, requestedByUserId } = job.data as BoardExportJobData;
    console.log(`[BullMQ Worker] Processing export job ${job.id} for board ${boardId}`);

    // Progress 20%: Querying board and nested lists
    await job.updateProgress(20);

    const board = await prisma.board.findFirst({
      where: { id: boardId, workspaceId },
      include: {
        lists: {
          orderBy: { position: "asc" },
          include: {
            tasks: {
              orderBy: { position: "asc" },
              include: {
                assignee: { select: { id: true, name: true, email: true } },
                creator: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!board) {
      throw new Error(`Board ${boardId} not found in workspace ${workspaceId}`);
    }

    // Progress 60%: Aggregating task statistics and formatting export package
    await job.updateProgress(60);

    let totalTasksCount = 0;
    const structuredLists = board.lists.map((list) => {
      totalTasksCount += list.tasks.length;
      return {
        id: list.id,
        title: list.title,
        position: list.position,
        tasks: list.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          label: task.label,
          priority: task.priority,
          dueDate: task.dueDate,
          position: task.position,
          assignee: task.assignee ? task.assignee.name : null,
          creator: task.creator.name,
          createdAt: task.createdAt,
        })),
      };
    });

    // Progress 90%: Logging audit activity
    await job.updateProgress(90);

    await prisma.activityLog.create({
      data: {
        workspaceId,
        userId: requestedByUserId,
        action: "BOARD_EXPORTED",
        entityType: "BOARD",
        entityId: boardId,
        metadata: { totalTasks: totalTasksCount, jobId: job.id },
      },
    });

    // Progress 100%: Completed
    await job.updateProgress(100);

    const result: BoardExportJobResult = {
      boardId,
      title: board.title,
      workspaceId,
      exportedAt: new Date().toISOString(),
      summary: {
        listsCount: board.lists.length,
        tasksCount: totalTasksCount,
      },
      exportData: {
        board: {
          id: board.id,
          title: board.title,
          description: board.description,
        },
        columns: structuredLists,
      },
    };

    console.log(`[BullMQ Worker] Completed export job ${job.id}`);
    return result;
  },
  {
    connection: connection as any,
    concurrency: 2,
  }
);

exportWorker.on("completed", (job) => {
  console.log(`[BullMQ] Job ${job.id} completed successfully`);
});

exportWorker.on("failed", (job, err) => {
  console.error(`[BullMQ] Job ${job?.id} failed:`, err.message);
});

exportWorker.on("error", (err) => {
  console.warn(`[BullMQ Worker Notice]: ${err.message}. Handling gracefully.`);
});
