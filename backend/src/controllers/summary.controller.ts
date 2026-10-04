import { Request, Response } from "express";
import prisma from "../config/db";
import { getCache, setCache, invalidateCache } from "../config/redis";

export function getWorkspaceSummaryCacheKey(workspaceId: string): string {
  return `workspace:${workspaceId}:summary`;
}

export async function invalidateWorkspaceSummaryCache(workspaceId: string): Promise<void> {
  const key = getWorkspaceSummaryCacheKey(workspaceId);
  await invalidateCache(key);
}

// GET /api/v1/workspaces/:workspaceId/summary
// Genuinely expensive read path: aggregates workspace stats, boards, tasks by priority, and timeline
export async function getWorkspaceSummary(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId as string;
    const cacheKey = getWorkspaceSummaryCacheKey(workspaceId);

    // 1. Redis Cache Lookup
    const cachedData = await getCache<any>(cacheKey);
    if (cachedData) {
      res.status(200).json({
        source: "cache",
        summary: cachedData,
      });
      return;
    }

    // 2. Database Fallback (Execute complex multi-table aggregations)
    const [
      workspace,
      totalBoards,
      totalTasks,
      tasksByPriority,
      recentActivity,
      activeMembersCount,
    ] = await prisma.$transaction([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, slug: true, createdAt: true },
      }),
      prisma.board.count({ where: { workspaceId } }),
      prisma.task.count({ where: { workspaceId } }),
      prisma.task.groupBy({
        by: ["priority"],
        where: { workspaceId },
        _count: { _all: true },
        orderBy: { priority: "asc" },
      }),
      prisma.activityLog.findMany({
        where: { workspaceId },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
    ]);

    if (!workspace) {
      res.status(404).json({
        error: "NotFound",
        message: "Workspace not found",
      });
      return;
    }

    const priorityCounts: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      URGENT: 0,
    };

    tasksByPriority.forEach((group: any) => {
      priorityCounts[group.priority] = group._count?._all || 0;
    });

    const summaryPayload = {
      workspace,
      metrics: {
        totalBoards,
        totalTasks,
        activeMembersCount,
        tasksByPriority: priorityCounts,
      },
      recentActivity,
      generatedAt: new Date().toISOString(),
    };

    // 3. Cache Storage (5 minutes TTL - avoids permanently stale cache)
    await setCache(cacheKey, summaryPayload, 300);

    res.status(200).json({
      source: "database",
      summary: summaryPayload,
    });
  } catch (error: any) {
    console.error("[Summary] Error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to generate workspace summary",
    });
  }
}
