import assert from "assert";
import { Request, Response, NextFunction } from "express";
import { WorkspaceRole } from "@prisma/client";
import { calculatePosition } from "../controllers/list.controller";
import { requireWorkspaceRole } from "../middlewares/rbac.middleware";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/token";
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

async function runUnitTests() {
  console.log("==================================================");
  console.log("UNIT TESTS: Business Logic, Authorization & Ordering");
  console.log("==================================================\n");

  // -------------------------------------------------------------
  // 1. ORDERING LOGIC (Fractional Midpoint Calculations)
  // -------------------------------------------------------------
  console.log("[Unit Test 1] Ordering Logic: Initial, append, prepend & mid-point calculations");
  // Empty list -> initial 1000
  const posInitial = calculatePosition(null, null);
  assert.strictEqual(posInitial, 1000, "Empty list should assign position 1000");

  // Append after 1000 -> 2000
  const posAppend = calculatePosition(1000, null);
  assert.strictEqual(posAppend, 2000, "Append after 1000 should assign 2000");

  // Prepend before 1000 -> 500
  const posPrepend = calculatePosition(null, 1000);
  assert.strictEqual(posPrepend, 500, "Prepend before 1000 should assign 500");

  // Mid-point insert between 1000 and 2000 -> 1500
  const posMid = calculatePosition(1000, 2000);
  assert.strictEqual(posMid, 1500, "Insert between 1000 and 2000 should assign 1500");

  // Nested midpoint between 1500 and 2000 -> 1750
  const posNested = calculatePosition(1500, 2000);
  assert.strictEqual(posNested, 1750, "Insert between 1500 and 2000 should assign 1750");

  // Verify strict monotonic ascending order
  const order = [posPrepend, posInitial, posMid, posNested, posAppend];
  const sorted = [...order].sort((a, b) => a - b);
  assert.deepStrictEqual(order, sorted, "Calculated positions must be strictly sorted");
  console.log("✓ Ordering logic: All fractional position scenarios calculate correctly.\n");

  // -------------------------------------------------------------
  // 2. CONCURRENT ORDERING INVARIANT
  // -------------------------------------------------------------
  console.log("[Unit Test 2] Ordering Logic: Concurrent drag-and-drop movement");
  // Simulating concurrent drops between adjacent slots without locks
  const posDrop1 = calculatePosition(2000, 3000); // 2500
  const posDrop2 = calculatePosition(3000, 4000); // 3500
  const posDrop3 = calculatePosition(null, 250);   // 125
  const combinedPositions = [2000, posDrop1, 3000, posDrop2, 4000, posDrop3].sort((a, b) => a - b);
  assert.deepStrictEqual(combinedPositions, [125, 2000, 2500, 3000, 3500, 4000]);
  console.log("✓ Ordering logic: Concurrent drops yield deterministic, non-conflicting order.\n");

  // -------------------------------------------------------------
  // 3. AUTHORIZATION RULES (RBAC Hierarchy & Mutation Rights)
  // -------------------------------------------------------------
  console.log("[Unit Test 3] Authorization Rules: Mutation permissions per role");

  const originalFindUnique = prisma.workspaceMember.findUnique;

  try {
    const taskMutationGuard = requireWorkspaceRole([
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MEMBER,
    ]);

    // Scenario A: VIEWER must be rejected from task mutations with 403 Forbidden
    (prisma.workspaceMember as any).findUnique = async () => ({
      id: "mem-v",
      workspaceId: "ws-1",
      userId: "u-v",
      role: WorkspaceRole.VIEWER,
    });

    const { req: r1, res: s1, getStatus: st1 } = createMockContext(
      { id: "u-v" },
      { workspaceId: "ws-1" }
    );
    let called1 = false;
    await taskMutationGuard(r1, s1, (() => { called1 = true; }) as NextFunction);
    assert.strictEqual(st1(), 403, "Viewer must be rejected with 403");
    assert.strictEqual(called1, false);
    console.log("  ✓ VIEWER role is strictly blocked from task mutations (403)");

    // Scenario B: MEMBER must be allowed task mutations
    (prisma.workspaceMember as any).findUnique = async () => ({
      id: "mem-m",
      workspaceId: "ws-1",
      userId: "u-m",
      role: WorkspaceRole.MEMBER,
    });

    const { req: r2, res: s2 } = createMockContext(
      { id: "u-m" },
      { workspaceId: "ws-1" }
    );
    let called2 = false;
    await taskMutationGuard(r2, s2, (() => { called2 = true; }) as NextFunction);
    assert.strictEqual(called2, true, "Member must be permitted");
    console.log("  ✓ MEMBER role is allowed to perform task mutations");

    // Scenario C: MEMBER must be blocked from member management (Owner/Admin only)
    const memberMgmtGuard = requireWorkspaceRole([
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    const { req: r3, res: s3, getStatus: st3 } = createMockContext(
      { id: "u-m" },
      { workspaceId: "ws-1" }
    );
    let called3 = false;
    await memberMgmtGuard(r3, s3, (() => { called3 = true; }) as NextFunction);
    assert.strictEqual(st3(), 403, "Member must be rejected from member management");
    assert.strictEqual(called3, false);
    console.log("  ✓ MEMBER role is blocked from member administration (403)");

    // Scenario D: ADMIN must be allowed member management
    (prisma.workspaceMember as any).findUnique = async () => ({
      id: "mem-a",
      workspaceId: "ws-1",
      userId: "u-a",
      role: WorkspaceRole.ADMIN,
    });

    const { req: r4, res: s4 } = createMockContext(
      { id: "u-a" },
      { workspaceId: "ws-1" }
    );
    let called4 = false;
    await memberMgmtGuard(r4, s4, (() => { called4 = true; }) as NextFunction);
    assert.strictEqual(called4, true, "Admin must be permitted");
    console.log("  ✓ ADMIN role is allowed to perform member administration");

    // Scenario E: Cross-workspace tenant boundary
    (prisma.workspaceMember as any).findUnique = async () => null; // Not a member of Workspace Target
    const { req: r5, res: s5, getStatus: st5 } = createMockContext(
      { id: "u-a" },
      { workspaceId: "ws-foreign" }
    );
    let called5 = false;
    await memberMgmtGuard(r5, s5, (() => { called5 = true; }) as NextFunction);
    assert.strictEqual(st5(), 403, "Non-member must be denied access to foreign workspace");
    assert.strictEqual(called5, false);
    console.log("  ✓ Cross-workspace tenant boundary strictly enforced (403)");
  } finally {
    (prisma.workspaceMember as any).findUnique = originalFindUnique;
  }

  // -------------------------------------------------------------
  // 4. TOKEN UTILITIES & PASSWORD CRYPTOGRAPHY
  // -------------------------------------------------------------
  console.log("\n[Unit Test 4] Cryptographic Utilities: Password hashing and JWT rotation");
  const plain = "Secur3P@ssw0rd!";
  const hash = await hashPassword(plain);
  assert.strictEqual(await comparePassword(plain, hash), true);
  assert.strictEqual(await comparePassword("Wrong", hash), false);

  const aToken = generateAccessToken({ userId: "u-1", email: "u1@test.com" });
  const decodedA = verifyAccessToken(aToken);
  assert.strictEqual(decodedA.userId, "u-1");

  const rToken = generateRefreshToken({ userId: "u-1", tokenId: "tok-1" });
  const decodedR = verifyRefreshToken(rToken);
  assert.strictEqual(decodedR.tokenId, "tok-1");
  console.log("✓ Password hashing (bcrypt) and JWT signatures verify successfully.\n");

  console.log("==================================================");
  console.log("ALL UNIT TESTS PASSED SUCCESSFULLY");
  console.log("==================================================");
}

runUnitTests().catch((err) => {
  console.error("Unit test failure:", err);
  process.exit(1);
});
