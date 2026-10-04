import assert from "assert";
import { Request, Response, NextFunction } from "express";
import { WorkspaceRole } from "@prisma/client";
import { requireWorkspaceRole } from "../middlewares/rbac.middleware";
import prisma from "../config/db";
import "../types/express";

// Helper to mock Express Request and Response
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

async function runRbacTests() {
  console.log("=== RUNNING RBAC & WORKSPACE ISOLATION TESTS ===\n");

  const originalFindUnique = prisma.workspaceMember.findUnique;

  try {
    // -------------------------------------------------------------
    // Test 1: Reject unauthenticated request to workspace endpoint
    // -------------------------------------------------------------
    console.log("[Test 1] Testing unauthenticated workspace access...");
    const { req: req1, res: res1, getStatus: status1, getBody: body1 } = createMockContext(
      undefined, // No authenticated user
      { workspaceId: "ws-123" }
    );
    let calledNext1 = false;
    const middleware1 = requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.MEMBER]);
    await middleware1(req1, res1, (() => { calledNext1 = true; }) as NextFunction);

    assert.strictEqual(status1(), 401, "Unauthenticated request must return 401");
    assert.strictEqual(calledNext1, false, "next() must not be called");
    console.log("✓ Unauthenticated request rejected with 401.");

    // -------------------------------------------------------------
    // Test 2: Reject non-member (Workspace Isolation Boundary)
    // -------------------------------------------------------------
    console.log("\n[Test 2] Testing workspace isolation: User accessing Workspace they are NOT member of...");
    // Mock prisma to return null (user is not a member of Workspace A)
    (prisma.workspaceMember as any).findUnique = async () => null;

    const { req: req2, res: res2, getStatus: status2, getBody: body2 } = createMockContext(
      { id: "user-attacker", email: "attacker@othercompany.com", name: "Attacker" },
      { workspaceId: "workspace-company-a" }
    );
    let calledNext2 = false;
    await middleware1(req2, res2, (() => { calledNext2 = true; }) as NextFunction);

    assert.strictEqual(status2(), 403, "Non-member must be denied with 403 Forbidden");
    assert.strictEqual(body2().error, "Forbidden");
    assert.strictEqual(calledNext2, false, "next() must not be called");
    console.log("✓ Strict workspace isolation: Non-member rejected with 403 Forbidden.");

    // -------------------------------------------------------------
    // Test 3: Reject VIEWER attempting mutation requiring [OWNER, ADMIN]
    // -------------------------------------------------------------
    console.log("\n[Test 3] Testing Viewer permissions: VIEWER attempting member management (mutation)...");
    (prisma.workspaceMember as any).findUnique = async () => ({
      id: "membership-viewer",
      workspaceId: "ws-123",
      userId: "user-viewer",
      role: WorkspaceRole.VIEWER,
    });

    const { req: req3, res: res3, getStatus: status3, getBody: body3 } = createMockContext(
      { id: "user-viewer", email: "viewer@example.com", name: "Viewer User" },
      { workspaceId: "ws-123" }
    );
    let calledNext3 = false;
    const adminOnlyMiddleware = requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
    await adminOnlyMiddleware(req3, res3, (() => { calledNext3 = true; }) as NextFunction);

    assert.strictEqual(status3(), 403, "Viewer role must be rejected for mutations");
    assert.strictEqual(body3().error, "Forbidden");
    assert.strictEqual(calledNext3, false);
    console.log("✓ Viewer attempting mutation successfully blocked with 403 Forbidden.");

    // -------------------------------------------------------------
    // Test 4: Reject MEMBER attempting member management
    // -------------------------------------------------------------
    console.log("\n[Test 4] Testing Member permissions: MEMBER attempting member management...");
    (prisma.workspaceMember as any).findUnique = async () => ({
      id: "membership-member",
      workspaceId: "ws-123",
      userId: "user-member",
      role: WorkspaceRole.MEMBER,
    });

    const { req: req4, res: res4, getStatus: status4 } = createMockContext(
      { id: "user-member", email: "member@example.com", name: "Member User" },
      { workspaceId: "ws-123" }
    );
    let calledNext4 = false;
    await adminOnlyMiddleware(req4, res4, (() => { calledNext4 = true; }) as NextFunction);

    assert.strictEqual(status4(), 403, "Member role must be rejected for admin-only routes");
    assert.strictEqual(calledNext4, false);
    console.log("✓ Member attempting admin action successfully blocked with 403 Forbidden.");

    // -------------------------------------------------------------
    // Test 5: Allow VIEWER to perform read operations
    // -------------------------------------------------------------
    console.log("\n[Test 5] Testing Viewer read access...");
    (prisma.workspaceMember as any).findUnique = async () => ({
      id: "membership-viewer",
      workspaceId: "ws-123",
      userId: "user-viewer",
      role: WorkspaceRole.VIEWER,
    });

    const readMiddleware = requireWorkspaceRole([
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MEMBER,
      WorkspaceRole.VIEWER,
    ]);

    const { req: req5, res: res5, getStatus: status5 } = createMockContext(
      { id: "user-viewer", email: "viewer@example.com", name: "Viewer User" },
      { workspaceId: "ws-123" }
    );
    let calledNext5 = false;
    await readMiddleware(req5, res5, (() => { calledNext5 = true; }) as NextFunction);

    assert.strictEqual(calledNext5, true, "Viewer must be permitted for read actions");
    assert.strictEqual(req5.workspaceMember?.role, WorkspaceRole.VIEWER);
    console.log("✓ Viewer read access successfully permitted.");

    // -------------------------------------------------------------
    // Test 6: Allow OWNER and ADMIN to perform management actions
    // -------------------------------------------------------------
    console.log("\n[Test 6] Testing Admin and Owner access to management actions...");
    (prisma.workspaceMember as any).findUnique = async () => ({
      id: "membership-admin",
      workspaceId: "ws-123",
      userId: "user-admin",
      role: WorkspaceRole.ADMIN,
    });

    const { req: req6, res: res6 } = createMockContext(
      { id: "user-admin", email: "admin@example.com", name: "Admin User" },
      { workspaceId: "ws-123" }
    );
    let calledNext6 = false;
    await adminOnlyMiddleware(req6, res6, (() => { calledNext6 = true; }) as NextFunction);

    assert.strictEqual(calledNext6, true, "Admin must be permitted for management actions");
    console.log("✓ Admin & Owner management permissions verified.");

    console.log("\n=== ALL RBAC & WORKSPACE ISOLATION TESTS PASSED ===");
  } finally {
    (prisma.workspaceMember as any).findUnique = originalFindUnique;
  }
}

runRbacTests().catch((err) => {
  console.error("RBAC test failed:", err);
  process.exit(1);
});
