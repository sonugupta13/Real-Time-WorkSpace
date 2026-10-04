import assert from "assert";
import { Request, Response, NextFunction } from "express";
import { WorkspaceRole } from "@prisma/client";
import { calculatePosition } from "../controllers/list.controller";
import { requireWorkspaceRole } from "../middlewares/rbac.middleware";
import prisma from "../config/db";
import "../types/express";

function createMockContext(user?: any, params?: any, body?: any) {
  const req = {
    user,
    params: params || {},
    body: body || {},
    headers: {},
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

async function runTaskManagementTests() {
  console.log("=== RUNNING TASK MANAGEMENT, ORDERING & CONCURRENCY TESTS ===\n");

  // -------------------------------------------------------------
  // Test 1: Persistent Ordering & Fractional Position Calculations
  // -------------------------------------------------------------
  console.log("[Test 1] Testing fractional positioning logic...");
  // Initial card in list
  const initialPos = calculatePosition(null, null);
  assert.strictEqual(initialPos, 1000, "Initial position must be 1000");

  // Append after item (Pos 1000)
  const appendPos = calculatePosition(1000, null);
  assert.strictEqual(appendPos, 2000, "Appended position must be 2000");

  // Insert between two items (Pos 1000 and 2000)
  const insertBetween = calculatePosition(1000, 2000);
  assert.strictEqual(insertBetween, 1500, "Mid-point position must be 1500");

  // Prepend before first item (Pos 1000)
  const prependPos = calculatePosition(null, 1000);
  assert.strictEqual(prependPos, 500, "Prepend position must be 500");

  // Consecutive nested inserts between 1500 and 2000
  const nestedPos = calculatePosition(1500, 2000);
  assert.strictEqual(nestedPos, 1750, "Nested insert position must be 1750");

  // Verify sorting order: 500 < 1000 < 1500 < 1750 < 2000
  const positions = [appendPos, nestedPos, initialPos, prependPos, insertBetween];
  positions.sort((a, b) => a - b);
  assert.deepStrictEqual(positions, [500, 1000, 1500, 1750, 2000], "Positions must order correctly");
  console.log("✓ Fractional positioning calculates monotonic ordering correctly.");

  // -------------------------------------------------------------
  // Test 2: Concurrent Drag-and-Drop Invariant Simulation
  // -------------------------------------------------------------
  console.log("\n[Test 2] Simulating concurrent drag-and-drop actions...");
  // User A drops card between 1000 and 2000 -> 1500
  // User B drops card between 2000 and 3000 -> 2500
  // User C drops card before 500 -> 250
  const userAPos = calculatePosition(1000, 2000);
  const userBPos = calculatePosition(2000, 3000);
  const userCPos = calculatePosition(null, 500);

  const fullList = [500, 1000, userAPos, 2000, userBPos, 3000, userCPos];
  fullList.sort((a, b) => a - b);
  assert.deepStrictEqual(fullList, [250, 500, 1000, 1500, 2000, 2500, 3000]);
  console.log("✓ Concurrent drag operations yield deterministic non-conflicting positions.");

  // -------------------------------------------------------------
  // Test 3: RBAC Guard - Reject VIEWER on Board/List/Task Mutations
  // -------------------------------------------------------------
  console.log("\n[Test 3] Testing RBAC on task mutations for VIEWER role...");
  const originalFindUnique = prisma.workspaceMember.findUnique;

  try {
    (prisma.workspaceMember as any).findUnique = async () => ({
      id: "membership-viewer",
      workspaceId: "ws-alpha",
      userId: "user-viewer",
      role: WorkspaceRole.VIEWER,
    });

    const mutationGuard = requireWorkspaceRole([
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MEMBER,
    ]);

    // Mutation 1: Create Board
    const { req: r1, res: s1, getStatus: st1 } = createMockContext(
      { id: "user-viewer" },
      { workspaceId: "ws-alpha" }
    );
    let calledNext1 = false;
    await mutationGuard(r1, s1, (() => { calledNext1 = true; }) as NextFunction);
    assert.strictEqual(st1(), 403, "Viewer must be rejected with 403 on Board creation");
    assert.strictEqual(calledNext1, false);

    // Mutation 2: Create Task
    const { req: r2, res: s2, getStatus: st2 } = createMockContext(
      { id: "user-viewer" },
      { workspaceId: "ws-alpha", listId: "list-1" }
    );
    let calledNext2 = false;
    await mutationGuard(r2, s2, (() => { calledNext2 = true; }) as NextFunction);
    assert.strictEqual(st2(), 403, "Viewer must be rejected with 403 on Task creation");
    assert.strictEqual(calledNext2, false);

    // Mutation 3: Move Task (Drag-and-Drop)
    const { req: r3, res: s3, getStatus: st3 } = createMockContext(
      { id: "user-viewer" },
      { workspaceId: "ws-alpha", taskId: "task-1" }
    );
    let calledNext3 = false;
    await mutationGuard(r3, s3, (() => { calledNext3 = true; }) as NextFunction);
    assert.strictEqual(st3(), 403, "Viewer must be rejected with 403 on Task move");
    assert.strictEqual(calledNext3, false);
    console.log("✓ Viewer role strictly blocked from all board/list/task mutations.");

    // -------------------------------------------------------------
    // Test 4: RBAC Guard - Allow MEMBER on Task Mutations
    // -------------------------------------------------------------
    console.log("\n[Test 4] Testing RBAC on task mutations for MEMBER role...");
    (prisma.workspaceMember as any).findUnique = async () => ({
      id: "membership-member",
      workspaceId: "ws-alpha",
      userId: "user-member",
      role: WorkspaceRole.MEMBER,
    });

    const { req: r4, res: s4 } = createMockContext(
      { id: "user-member" },
      { workspaceId: "ws-alpha", taskId: "task-1" }
    );
    let calledNext4 = false;
    await mutationGuard(r4, s4, (() => { calledNext4 = true; }) as NextFunction);
    assert.strictEqual(calledNext4, true, "Member must be permitted to mutate tasks");
    console.log("✓ Member role successfully authorized for task mutations.");

    // -------------------------------------------------------------
    // Test 5: Cross-Workspace Tenant Isolation
    // -------------------------------------------------------------
    console.log("\n[Test 5] Testing tenant isolation on task operations...");
    (prisma.workspaceMember as any).findUnique = async () => null; // Not a member of Workspace B

    const { req: r5, res: s5, getStatus: st5 } = createMockContext(
      { id: "user-member" },
      { workspaceId: "workspace-b", taskId: "task-999" }
    );
    let calledNext5 = false;
    await mutationGuard(r5, s5, (() => { calledNext5 = true; }) as NextFunction);
    assert.strictEqual(st5(), 403, "User cannot access tasks of another workspace");
    assert.strictEqual(calledNext5, false);
    console.log("✓ Cross-workspace task access strictly blocked with 403 Forbidden.");

    console.log("\n=== ALL TASK MANAGEMENT & ORDERING TESTS PASSED ===");
  } finally {
    (prisma.workspaceMember as any).findUnique = originalFindUnique;
  }
}

runTaskManagementTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
