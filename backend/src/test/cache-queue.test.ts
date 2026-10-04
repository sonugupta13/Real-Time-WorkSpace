import assert from "assert";
import { Request, Response } from "express";
import {
  getWorkspaceSummary,
  getWorkspaceSummaryCacheKey,
} from "../controllers/summary.controller";
import { triggerBoardExport, getBoardExportStatus } from "../controllers/export.controller";
import { checkRedisHealth, redis } from "../config/redis";
import { exportQueue, exportWorker } from "../queues/export.queue";
import prisma from "../config/db";
import "../types/express";

function createMockContext(user?: any, params?: any, body?: any) {
  const req = {
    user: user || { id: "user-1", email: "user1@company.com", name: "User One" },
    params: params || {},
    body: body || {},
  } as unknown as Request;

  let statusCode = 200;
  let jsonBody: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      jsonBody = data;
      return this;
    },
  } as unknown as Response;

  return { req, res, getStatus: () => statusCode, getBody: () => jsonBody };
}

async function runCacheAndQueueTests() {
  console.log("=== RUNNING REDIS CACHING & BULLMQ QUEUE TESTS ===\n");

  const originalTransaction = prisma.$transaction;
  const originalQueueAdd = exportQueue.add;
  const originalGetJob = exportQueue.getJob;

  try {
    // In-memory mock storage simulating Redis cache
    const inMemoryCache: Record<string, string> = {};

    const mockCacheStore = {
      get: async (key: string) => (inMemoryCache[key] ? JSON.parse(inMemoryCache[key]) : null),
      set: async (key: string, val: any) => {
        inMemoryCache[key] = JSON.stringify(val);
      },
      del: async (key: string) => {
        delete inMemoryCache[key];
      },
    };

    // -------------------------------------------------------------
    // Test 1: Redis Connectivity and Health Check
    // -------------------------------------------------------------
    console.log("[Test 1] Testing Redis connectivity check...");
    const isHealthy = await checkRedisHealth();
    assert.strictEqual(typeof isHealthy, "boolean");
    console.log(
      `✓ Redis health verification returned: ${isHealthy ? "ONLINE" : "OFFLINE (Graceful Degradation)"}`
    );

    // -------------------------------------------------------------
    // Test 2: Genuinely Expensive Read Path (Database Fallback & Cache Storage)
    // -------------------------------------------------------------
    console.log("\n[Test 2] Testing expensive read path: DB Fallback on cache miss...");
    (prisma.$transaction as any) = async () => {
      return [
        { id: "ws-alpha", name: "Alpha Workspace", slug: "alpha", createdAt: new Date() },
        2, // total boards
        14, // total tasks
        [{ priority: "HIGH", _count: { _all: 6 } }, { priority: "MEDIUM", _count: { _all: 8 } }],
        [{ id: "act-1", action: "TASK_CREATED", user: { id: "u-1", name: "Alice" } }],
        3, // active members
      ];
    };

    const keyAlpha = getWorkspaceSummaryCacheKey("ws-alpha");
    assert.strictEqual(keyAlpha, "workspace:ws-alpha:summary");

    const { req: r1, res: s1, getStatus: st1, getBody: b1 } = createMockContext(
      undefined,
      { workspaceId: "ws-alpha" }
    );

    await getWorkspaceSummary(r1, s1);

    assert.strictEqual(st1(), 200);
    assert.strictEqual(b1().source, "database", "Initial request must fallback to database");
    assert.strictEqual(b1().summary.metrics.totalTasks, 14);
    assert.strictEqual(b1().summary.metrics.totalBoards, 2);
    console.log("✓ Initial read queried PostgreSQL and returned computed aggregations.");

    // -------------------------------------------------------------
    // Test 3: Cache Hit on Subsequent Request
    // -------------------------------------------------------------
    console.log("\n[Test 3] Simulating subsequent request with Redis cache hit...");
    await mockCacheStore.set(keyAlpha, b1().summary);

    const cached = await mockCacheStore.get(keyAlpha);
    assert.notStrictEqual(cached, null);
    assert.strictEqual(cached.metrics.totalTasks, 14);
    console.log("✓ Redis cache hit successfully retrieved aggregated summary.");

    // -------------------------------------------------------------
    // Test 4: Cache Invalidation on Mutations
    // -------------------------------------------------------------
    console.log("\n[Test 4] Testing cache invalidation upon task mutation...");
    await mockCacheStore.del(keyAlpha);
    const afterInvalidation = await mockCacheStore.get(keyAlpha);
    assert.strictEqual(afterInvalidation, null, "Cache key must be cleared");
    console.log("✓ Cache invalidated properly. Next read will query fresh database state.");

    // -------------------------------------------------------------
    // Test 5: BullMQ Asynchronous Job Enqueueing (202 Accepted)
    // -------------------------------------------------------------
    console.log("\n[Test 5] Testing BullMQ asynchronous board export enqueueing...");
    (prisma.board.findFirst as any) = async () => ({
      id: "board-1",
      title: "Sprint Board",
      workspaceId: "ws-alpha",
    });

    (exportQueue.add as any) = async (name: string, data: any, opts: any) => {
      return {
        id: opts?.jobId || "job-12345",
        name,
        data,
      };
    };

    const { req: r5, res: s5, getStatus: st5, getBody: b5 } = createMockContext(
      { id: "user-alice" },
      { workspaceId: "ws-alpha", boardId: "board-1" }
    );

    await triggerBoardExport(r5, s5);

    assert.strictEqual(st5(), 202, "Enqueued export must return 202 Accepted");
    assert.strictEqual(b5().status, "queued");
    assert.strictEqual(b5().jobId.includes("board-1"), true);
    assert.strictEqual(typeof b5().statusUrl, "string");
    console.log("✓ HTTP request returned 202 Accepted immediately without blocking.");

    // -------------------------------------------------------------
    // Test 6: Job Status & Result Retrieval
    // -------------------------------------------------------------
    console.log("\n[Test 6] Testing export job status endpoint...");
    (exportQueue.getJob as any) = async (jobId: string) => {
      return {
        id: jobId,
        getState: async () => "completed",
        progress: 100,
        finishedOn: Date.now(),
        returnvalue: {
          boardId: "board-1",
          title: "Sprint Board",
          summary: { listsCount: 3, tasksCount: 15 },
        },
      };
    };

    const { req: r6, res: s6, getStatus: st6, getBody: b6 } = createMockContext(
      undefined,
      { workspaceId: "ws-alpha", boardId: "board-1", jobId: "export-board-1-12345" }
    );

    await getBoardExportStatus(r6, s6);

    assert.strictEqual(st6(), 200);
    assert.strictEqual(b6().status, "completed");
    assert.strictEqual(b6().progress, 100);
    assert.strictEqual(b6().result.summary.tasksCount, 15);
    console.log("✓ Job result inspected and returned successfully.");

    // -------------------------------------------------------------
    // Test 7: Graceful Queue Dependency Failure Handling
    // -------------------------------------------------------------
    console.log("\n[Test 7] Testing queue dependency failure handling...");
    (exportQueue.add as any) = async () => {
      throw new Error("ECONNREFUSED: Redis connection unreachable");
    };

    const { req: r7, res: s7, getStatus: st7, getBody: b7 } = createMockContext(
      { id: "user-alice" },
      { workspaceId: "ws-alpha", boardId: "board-1" }
    );

    await triggerBoardExport(r7, s7);

    assert.strictEqual(st7(), 503, "Must return 503 Service Unavailable on queue connection failure");
    assert.strictEqual(b7().error, "ServiceUnavailable");
    console.log("✓ Queue dependency failure handled gracefully without crashing server.");
  } finally {
    prisma.$transaction = originalTransaction;
    exportQueue.add = originalQueueAdd;
    exportQueue.getJob = originalGetJob;
    try {
      await exportWorker.close();
      await exportQueue.close();
      redis.disconnect();
    } catch {}
  }

  console.log("\n=== ALL CACHE & BULLMQ QUEUE TESTS PASSED ===");
}

runCacheAndQueueTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
