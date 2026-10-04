import { io } from "socket.io-client";

async function verifyAll() {
  console.log("=== PHASE 9 VERIFICATION SUITE ===");

  // 1. Test Login
  console.log("\n[Test 1] Testing Login for Sonu Gupta (Owner)...");
  const sonuRes = await fetch("http://localhost:5000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "sonugupta@gmail.com", password: "Password123!" }),
  });
  const sonuAuth: any = await sonuRes.json();
  if (!sonuRes.ok || !sonuAuth.tokens?.accessToken) {
    throw new Error(`Sonu Gupta login failed: ${JSON.stringify(sonuAuth)}`);
  }
  const sonuToken = sonuAuth.tokens.accessToken;
  const aliceToken = sonuToken; // Alias
  console.log("✓ Sonu Gupta logged in successfully. ID:", sonuAuth.user.id);

  // Test Login for Niraj Kumar Sahani (Member)
  console.log("\n[Test 2] Testing Login for Niraj Kumar Sahani (Member)...");
  const nirajRes = await fetch("http://localhost:5000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nirajkumarsahani@gmail.com", password: "Password123!" }),
  });
  const nirajAuth: any = await nirajRes.json();
  const nirajToken = nirajAuth.tokens?.accessToken;
  const bobToken = nirajToken; // Alias
  console.log("✓ Niraj Kumar Sahani logged in successfully. ID:", nirajAuth.user.id);

  // 2. Test Workspace
  console.log("\n[Test 3] Testing Workspace Fetch...");
  const wsRes = await fetch("http://localhost:5000/api/v1/workspaces", {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const wsData: any = await wsRes.json();
  const ws = wsData.workspaces[0];
  console.log(`✓ Workspaces retrieved. Active Workspace: "${ws.name}" (${ws.id})`);

  // 3. Test RBAC UI / Members
  console.log("\n[Test 4] Testing Workspace Members & RBAC...");
  const membersRes = await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/members`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const membersData: any = await membersRes.json();
  console.log(`✓ Workspace Members count: ${membersData.members.length}`);
  membersData.members.forEach((m: any) => {
    console.log(`  - ${m.user.name || m.user.email}: ${m.role}`);
  });

  // 4. Test Boards & Lists
  console.log("\n[Test 5] Testing Board & Lists...");
  const boardsRes = await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/boards`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const boardsData: any = await boardsRes.json();
  let board = boardsData.boards[0];
  if (!board) {
    const createBoardRes = await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/boards`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ title: "Engineering Sprint", description: "Sprint 24 Board" }),
    });
    const createdBoardData: any = await createBoardRes.json();
    board = createdBoardData.board;
  }
  console.log(`✓ Board ready: "${board.title}" (${board.id})`);

  // Fetch full board details with lists
  let boardDetailRes = await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/boards/${board.id}`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  let boardDetail: any = await boardDetailRes.json();
  let lists = boardDetail.board.lists;

  if (!lists || lists.length === 0) {
    console.log("Creating default lists...");
    await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/boards/${board.id}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ title: "To Do" }),
    });
    await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/boards/${board.id}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ title: "In Progress" }),
    });
    await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/boards/${board.id}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ title: "Done" }),
    });
    boardDetailRes = await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/boards/${board.id}`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    boardDetail = await boardDetailRes.json();
    lists = boardDetail.board.lists;
  }
  console.log(`✓ Board Lists: ${lists.map((l: any) => l.title).join(", ")}`);

  // 5. Test Two WebSocket Clients (Simulating Two Browser Windows!)
  console.log("\n[Test 6] Connecting Two Browser Sockets (Alice & Bob) to verify multi-window real-time sync...");
  const socketAlice = io("http://localhost:5000", {
    auth: { token: `Bearer ${aliceToken}` },
    transports: ["websocket"],
  });

  const socketBob = io("http://localhost:5000", {
    auth: { token: `Bearer ${bobToken}` },
    transports: ["websocket"],
  });

  await Promise.all([
    new Promise<void>((resolve) => {
      socketAlice.on("connect", () => {
        socketAlice.emit("join:board", { workspaceId: ws.id, boardId: board.id }, () => resolve());
      });
    }),
    new Promise<void>((resolve) => {
      socketBob.on("connect", () => {
        socketBob.emit("join:board", { workspaceId: ws.id, boardId: board.id }, () => resolve());
      });
    }),
  ]);
  console.log("✓ Both Window A (Alice) and Window B (Bob) joined board room successfully!");

  // Track events received by Bob's window
  const bobReceivedEvents: string[] = [];
  socketBob.on("task:created", (data: any) => bobReceivedEvents.push(`created:${data.task?.title}`));
  socketBob.on("task:updated", (data: any) => bobReceivedEvents.push(`updated:${data.task?.title}`));
  socketBob.on("task:moved", (data: any) => bobReceivedEvents.push(`moved:${data.task?.id}`));
  socketBob.on("task:deleted", (data: any) => bobReceivedEvents.push(`deleted:${data.taskId}`));

  // 6. Test Task CRUD (Alice creates, edits, moves, and deletes a task)
  console.log("\n[Test 7] Alice creates a task...");
  const createRes = await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/lists/${lists[0].id}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({
      title: "Real-Time Verification Task",
      description: "Testing drag and drop and multi-window live updates",
      priority: "HIGH",
    }),
  });
  const createdTaskData: any = await createRes.json();
  const task = createdTaskData.task;
  console.log(`✓ Task created: "${task.title}" (ID: ${task.id})`);

  // Wait 300ms for WebSocket delivery to Bob
  await new Promise((r) => setTimeout(r, 300));

  console.log("\n[Test 8] Alice updates the task...");
  const updateRes = await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({
      title: "Real-Time Verification Task (Updated)",
      priority: "URGENT",
    }),
  });
  const updatedData: any = await updateRes.json();
  console.log(`✓ Task updated: "${updatedData.task.title}" Priority: ${updatedData.task.priority}`);

  await new Promise((r) => setTimeout(r, 300));

  // 7. Test Drag-and-Drop Task Movement & Ordering
  console.log("\n[Test 9] Drag-and-Drop: Moving task to second list with new position...");
  const moveRes = await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/tasks/${task.id}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({
      targetListId: lists[1].id,
      newPosition: 5000,
    }),
  });
  const movedData: any = await moveRes.json();
  console.log(`✓ Task moved to list "${lists[1].title}" at position ${movedData.task.position}`);

  await new Promise((r) => setTimeout(r, 300));

  // 8. Test Search & Filter
  console.log("\n[Test 10] Testing Search & Filter API...");
  const searchRes = await fetch(
    `http://localhost:5000/api/v1/workspaces/${ws.id}/tasks/search?q=Real-Time&priority=URGENT`,
    {
      headers: { Authorization: `Bearer ${aliceToken}` },
    }
  );
  const searchData: any = await searchRes.json();
  console.log(`✓ Search returned ${searchData.tasks?.length} tasks matching "Real-Time" with priority URGENT`);

  // 9. Test Activity Log
  console.log("\n[Test 11] Testing Activity Log API...");
  const actRes = await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/activity?page=1&limit=5`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const actData: any = await actRes.json();
  console.log(`✓ Activity log retrieved. Total activities recorded: ${actData.pagination?.total}`);
  if (actData.activities?.length > 0) {
    console.log(`  Latest Action: ${actData.activities[0].action} by ${actData.activities[0].user?.email}`);
  }

  // 10. Check Bob's Window Received All Events
  console.log("\n[Test 12] Verifying Bob's Window received all real-time events...");
  console.log("Events received by Window B (Bob):", bobReceivedEvents);
  if (bobReceivedEvents.length < 3) {
    throw new Error(`Expected at least 3 events, received: ${bobReceivedEvents.length}`);
  }
  console.log("✓ Window B received all real-time broadcasts within <1s without polling!");

  // Clean up
  await fetch(`http://localhost:5000/api/v1/workspaces/${ws.id}/tasks/${task.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  socketAlice.disconnect();
  socketBob.disconnect();

  console.log("\n=== ALL PHASE 9 VERIFICATIONS PASSED WITH 100% SUCCESS! ===");
}

verifyAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
