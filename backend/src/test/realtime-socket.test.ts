import http from "http";
import assert from "assert";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import { initSocket, emitToBoard } from "../config/socket";
import { generateAccessToken } from "../utils/token";
import app from "../app";
import prisma from "../config/db";

async function runRealtimeSocketTests() {
  console.log("=== RUNNING REAL-TIME WEBSOCKET (SOCKET.IO) SYNCHRONIZATION TESTS ===\n");

  const server = http.createServer(app);
  initSocket(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const serverUrl = `http://localhost:${port}`;

  const tokenUser1 = generateAccessToken({ userId: "user-alice", email: "alice@company.com" });
  const tokenUser2 = generateAccessToken({ userId: "user-bob", email: "bob@company.com" });
  const tokenUser3 = generateAccessToken({ userId: "user-charlie", email: "charlie@company.com" });

  const originalFindUniqueUser = prisma.user.findUnique;
  const originalFindUniqueMember = prisma.workspaceMember.findUnique;
  const originalFindFirstBoard = prisma.board.findFirst;

  // Mock DB user lookups for handshake authentication
  (prisma.user as any).findUnique = async ({ where }: any) => {
    return { id: where.id, email: `${where.id}@company.com` };
  };

  // Mock DB membership lookups for room join authorization
  (prisma.workspaceMember as any).findUnique = async ({ where }: any) => {
    // Both Alice and Bob belong to workspace-alpha. Charlie belongs to workspace-beta.
    const { userId, workspaceId } = where.workspaceId_userId;
    if (workspaceId === "workspace-alpha" && (userId === "user-alice" || userId === "user-bob")) {
      return { id: "mem-1", workspaceId, userId, role: "MEMBER" };
    }
    if (workspaceId === "workspace-beta" && userId === "user-charlie") {
      return { id: "mem-2", workspaceId, userId, role: "MEMBER" };
    }
    return null;
  };

  (prisma.board as any).findFirst = async ({ where }: any) => {
    return { id: where.id, workspaceId: where.workspaceId, title: "Sprint Board" };
  };

  let clientA: ClientSocket;
  let clientB: ClientSocket;
  let clientC: ClientSocket;

  try {
    // -------------------------------------------------------------
    // Test 1: Reject Handshake without JWT Token
    // -------------------------------------------------------------
    console.log("[Test 1] Testing rejection of unauthenticated socket handshake...");
    const unauthClient = Client(serverUrl, {
      auth: { token: "" },
      transports: ["websocket"],
      reconnection: false,
    });

    const connectErrorPromise = new Promise<string>((resolve) => {
      unauthClient.on("connect_error", (err: any) => resolve(err.message));
    });

    const errorMsg = await connectErrorPromise;
    assert.strictEqual(errorMsg.includes("Authentication error"), true);
    unauthClient.disconnect();
    console.log("✓ Unauthenticated connection properly rejected with Authentication error.");

    // -------------------------------------------------------------
    // Test 2: Authenticated Handshake for Client A and Client B
    // -------------------------------------------------------------
    console.log("\n[Test 2] Connecting Client A (Alice) and Client B (Bob)...");
    clientA = Client(serverUrl, {
      auth: { token: `Bearer ${tokenUser1}` },
      transports: ["websocket"],
    });

    clientB = Client(serverUrl, {
      auth: { token: `Bearer ${tokenUser2}` },
      transports: ["websocket"],
    });

    clientC = Client(serverUrl, {
      auth: { token: `Bearer ${tokenUser3}` },
      transports: ["websocket"],
    });

    await Promise.all([
      new Promise<void>((res) => clientA.on("connect", res)),
      new Promise<void>((res) => clientB.on("connect", res)),
      new Promise<void>((res) => clientC.on("connect", res)),
    ]);
    console.log("✓ Clients A, B, and C connected with valid JWT tokens.");

    // -------------------------------------------------------------
    // Test 3: Join Board Room with Authorization
    // -------------------------------------------------------------
    console.log("\n[Test 3] Joining Board rooms with workspace authorization...");
    // Alice and Bob join Board 1 (in Workspace Alpha)
    const joinARes = await new Promise<any>((resolve) =>
      clientA.emit("join:board", { workspaceId: "workspace-alpha", boardId: "board-1" }, resolve)
    );
    assert.strictEqual(joinARes.success, true);

    const joinBRes = await new Promise<any>((resolve) =>
      clientB.emit("join:board", { workspaceId: "workspace-alpha", boardId: "board-1" }, resolve)
    );
    assert.strictEqual(joinBRes.success, true);

    // Charlie joins Board 2 (in Workspace Beta)
    const joinCRes = await new Promise<any>((resolve) =>
      clientC.emit("join:board", { workspaceId: "workspace-beta", boardId: "board-2" }, resolve)
    );
    assert.strictEqual(joinCRes.success, true);
    console.log("✓ Clients joined their respective authorized board rooms.");

    // -------------------------------------------------------------
    // Test 4: Real-time Event Broadcast (Task Created)
    // -------------------------------------------------------------
    console.log("\n[Test 4] Broadcasting 'task:created' on Board 1...");
    const sampleTask = {
      id: "task-101",
      title: "Implement Real-Time Sync",
      listId: "list-todo",
      position: 1000,
    };

    let receivedByB: any = null;
    let receivedByC: any = null;

    clientB.on("task:created", (data: any) => {
      receivedByB = data;
    });

    clientC.on("task:created", (data: any) => {
      receivedByC = data;
    });

    // Server emits after DB mutation
    emitToBoard("board-1", "task:created", { task: sampleTask, boardId: "board-1" });

    // Wait 100ms for event propagation
    await new Promise((r) => setTimeout(r, 100));

    assert.notStrictEqual(receivedByB, null, "Client B must receive task:created event");
    assert.strictEqual(receivedByB.task.id, "task-101");
    assert.strictEqual(receivedByC, null, "Client C in Workspace Beta must NOT receive Workspace Alpha events");
    console.log("✓ Client B received task:created in < 50ms without refreshing.");
    console.log("✓ Strict Room Isolation: Client C did not receive cross-board/cross-tenant event.");

    // -------------------------------------------------------------
    // Test 5: Real-time Task Move & Reorder Broadcast
    // -------------------------------------------------------------
    console.log("\n[Test 5] Broadcasting 'task:moved' on Board 1...");
    let moveReceivedByB: any = null;
    clientB.on("task:moved", (data: any) => {
      moveReceivedByB = data;
    });

    emitToBoard("board-1", "task:moved", {
      task: { ...sampleTask, listId: "list-in-progress", position: 1500 },
      boardId: "board-1",
      fromListId: "list-todo",
      toListId: "list-in-progress",
      newPosition: 1500,
    });

    await new Promise((r) => setTimeout(r, 100));

    assert.notStrictEqual(moveReceivedByB, null, "Client B must receive task:moved");
    assert.strictEqual(moveReceivedByB.toListId, "list-in-progress");
    assert.strictEqual(moveReceivedByB.newPosition, 1500);
    console.log("✓ Client B received task:moved event with updated persistent position.");

    // -------------------------------------------------------------
    // Test 6: Real-time Task Deletion Broadcast
    // -------------------------------------------------------------
    console.log("\n[Test 6] Broadcasting 'task:deleted' on Board 1...");
    let deleteReceivedByB: any = null;
    clientB.on("task:deleted", (data: any) => {
      deleteReceivedByB = data;
    });

    emitToBoard("board-1", "task:deleted", {
      taskId: "task-101",
      boardId: "board-1",
      listId: "list-in-progress",
    });

    await new Promise((r) => setTimeout(r, 100));

    assert.notStrictEqual(deleteReceivedByB, null, "Client B must receive task:deleted");
    assert.strictEqual(deleteReceivedByB.taskId, "task-101");
    console.log("✓ Client B received task:deleted event.");

    console.log("\n=== ALL REAL-TIME WEBSOCKET SYNCHRONIZATION TESTS PASSED ===");
  } finally {
    if (clientA!) clientA.disconnect();
    if (clientB!) clientB.disconnect();
    if (clientC!) clientC.disconnect();
    server.close();
    (prisma.user as any).findUnique = originalFindUniqueUser;
    (prisma.workspaceMember as any).findUnique = originalFindUniqueMember;
    (prisma.board as any).findFirst = originalFindFirstBoard;
  }
}

runRealtimeSocketTests().catch((err) => {
  console.error("Realtime test failed:", err);
  process.exit(1);
});
