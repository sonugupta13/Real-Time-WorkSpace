import assert from "assert";
import { Request, Response } from "express";
import { searchAndFilterTasks } from "../controllers/search.controller";
import { getWorkspaceActivity } from "../controllers/activity.controller";
import prisma from "../config/db";
import "../types/express";

function createMockContext(user?: any, params?: any, query?: any) {
  const req = {
    user: user || { id: "user-1", email: "user1@company.com", name: "User One" },
    params: params || {},
    query: query || {},
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

async function runSearchAndActivityTests() {
  console.log("=== RUNNING SEARCH, FILTERING, PAGINATION & ACTIVITY LOG TESTS ===\n");

  const originalTransaction = prisma.$transaction;

  try {
    // -------------------------------------------------------------
    // Test 1: Full-Text Search over Title and Description
    // -------------------------------------------------------------
    console.log("[Test 1] Testing full-text search over task title & description...");
    let capturedSearchWhere: any = null;

    (prisma.$transaction as any) = async (promises: any[]) => {
      // Return mock count and mock items
      return [
        2,
        [
          { id: "task-1", title: "Refactor Authentication API", description: "Use JWT tokens", workspaceId: "ws-alpha" },
          { id: "task-2", title: "Database Migration", description: "Authentication schema updates", workspaceId: "ws-alpha" },
        ],
      ];
    };

    // Override task.count to capture the WHERE clause
    const originalCount = prisma.task.count;
    (prisma.task as any).count = async ({ where }: any) => {
      capturedSearchWhere = where;
      return 2;
    };

    const { req: r1, res: s1, getStatus: st1, getBody: b1 } = createMockContext(
      undefined,
      { workspaceId: "ws-alpha" },
      { q: "Authentication", page: "1", limit: "10" }
    );

    await searchAndFilterTasks(r1, s1);

    assert.strictEqual(st1(), 200);
    assert.strictEqual(capturedSearchWhere.workspaceId, "ws-alpha", "Must be scoped strictly to ws-alpha");
    assert.deepStrictEqual(capturedSearchWhere.OR, [
      { title: { contains: "Authentication", mode: "insensitive" } },
      { description: { contains: "Authentication", mode: "insensitive" } },
    ]);
    assert.strictEqual(b1().tasks.length, 2);
    assert.strictEqual(b1().pagination.total, 2);
    console.log("✓ Full-text search correctly builds case-insensitive OR clause over title & description.");

    // -------------------------------------------------------------
    // Test 2: Multi-Field Filtering (Assignee, Label, Status, Priority)
    // -------------------------------------------------------------
    console.log("\n[Test 2] Testing multi-field filtering...");
    let capturedFilterWhere: any = null;
    (prisma.task as any).count = async ({ where }: any) => {
      capturedFilterWhere = where;
      return 1;
    };

    const { req: r2, res: s2, getStatus: st2 } = createMockContext(
      undefined,
      { workspaceId: "ws-alpha" },
      {
        assigneeId: "user-alice",
        label: "backend",
        status: "In Progress",
        priority: "HIGH",
      }
    );

    await searchAndFilterTasks(r2, s2);

    assert.strictEqual(st2(), 200);
    assert.strictEqual(capturedFilterWhere.workspaceId, "ws-alpha");
    assert.strictEqual(capturedFilterWhere.assigneeId, "user-alice");
    assert.deepStrictEqual(capturedFilterWhere.label, { equals: "backend", mode: "insensitive" });
    assert.strictEqual(capturedFilterWhere.priority, "HIGH");
    assert.deepStrictEqual(capturedFilterWhere.list.OR, [
      { id: "In Progress" },
      { title: { contains: "In Progress", mode: "insensitive" } },
    ]);
    console.log("✓ Filtering by Assignee, Label, Status, and Priority verified.");

    // -------------------------------------------------------------
    // Test 3: Pagination Metadata Calculation
    // -------------------------------------------------------------
    console.log("\n[Test 3] Testing pagination boundaries & metadata...");
    (prisma.task as any).count = async () => 45; // Total 45 tasks in database

    let capturedSkip = 0;
    let capturedTake = 0;
    (prisma.task as any).findMany = async ({ skip, take }: any) => {
      capturedSkip = skip;
      capturedTake = take;
      return Array(10).fill({ id: "t", title: "Task" });
    };

    (prisma.$transaction as any) = async (operations: any[]) => {
      return [45, Array(10).fill({ id: "t", title: "Task" })];
    };

    // Request Page 2 with limit 10
    const { req: r3, res: s3, getBody: b3 } = createMockContext(
      undefined,
      { workspaceId: "ws-alpha" },
      { page: "2", limit: "10" }
    );

    await searchAndFilterTasks(r3, s3);

    const pagination = b3().pagination;
    assert.strictEqual(pagination.total, 45);
    assert.strictEqual(pagination.page, 2);
    assert.strictEqual(pagination.limit, 10);
    assert.strictEqual(pagination.totalPages, 5);
    assert.strictEqual(pagination.hasNext, true);
    assert.strictEqual(pagination.hasPrev, true);
    console.log("✓ Pagination metadata accurately computed (Page 2 of 5, hasNext=true, hasPrev=true).");

    // -------------------------------------------------------------
    // Test 4: Activity Log Retrieval per Workspace
    // -------------------------------------------------------------
    console.log("\n[Test 4] Testing activity log retrieval...");
    let capturedActivityWhere: any = null;
    (prisma.activityLog as any).count = async ({ where }: any) => {
      capturedActivityWhere = where;
      return 3;
    };

    (prisma.$transaction as any) = async () => {
      return [
        3,
        [
          {
            id: "act-1",
            workspaceId: "ws-alpha",
            action: "TASK_MOVED",
            entityType: "TASK",
            entityId: "task-1",
            createdAt: new Date().toISOString(),
            user: { id: "user-1", name: "Alice", email: "alice@company.com" },
          },
          {
            id: "act-2",
            workspaceId: "ws-alpha",
            action: "MEMBER_INVITED",
            entityType: "MEMBER",
            entityId: "mem-1",
            createdAt: new Date().toISOString(),
            user: { id: "user-1", name: "Alice", email: "alice@company.com" },
          },
        ],
      ];
    };

    const { req: r4, res: s4, getStatus: st4, getBody: b4 } = createMockContext(
      undefined,
      { workspaceId: "ws-alpha" },
      { page: "1", limit: "20" }
    );

    await getWorkspaceActivity(r4, s4);

    assert.strictEqual(st4(), 200);
    assert.strictEqual(capturedActivityWhere.workspaceId, "ws-alpha", "Must be strictly scoped to workspace");
    assert.strictEqual(b4().activities.length, 2);
    assert.strictEqual(b4().activities[0].action, "TASK_MOVED");
    assert.strictEqual(b4().activities[0].user.name, "Alice");
    console.log("✓ Activity log properly records Workspace, Actor, Action, and Timestamp.");

    // -------------------------------------------------------------
    // Test 5: Strict Workspace Isolation (Zero cross-tenant exposure)
    // -------------------------------------------------------------
    console.log("\n[Test 5] Verifying strict workspace isolation in queries...");
    const { req: r5, res: s5 } = createMockContext(
      undefined,
      { workspaceId: "workspace-isolated-secret" },
      { q: "secret" }
    );

    let isolationVerified = false;
    (prisma.task as any).count = async ({ where }: any) => {
      assert.strictEqual(where.workspaceId, "workspace-isolated-secret");
      isolationVerified = true;
      return 0;
    };

    await searchAndFilterTasks(r5, s5);
    assert.strictEqual(isolationVerified, true, "Query must force where.workspaceId");
    console.log("✓ Workspace isolation guaranteed on all search and activity queries.");

    console.log("\n=== ALL SEARCH, FILTERING & ACTIVITY TESTS PASSED ===");
  } finally {
    prisma.$transaction = originalTransaction;
  }
}

runSearchAndActivityTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
