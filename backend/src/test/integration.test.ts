import http from "http";
import assert from "assert";
import app from "../app";

function makeRequest(
  server: http.Server,
  options: http.RequestOptions,
  bodyData?: any
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as any).port;
    const req = http.request(
      {
        ...options,
        port,
        host: "localhost",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            resolve({ statusCode: res.statusCode || 500, body: parsed });
          } catch {
            resolve({ statusCode: res.statusCode || 500, body: raw });
          }
        });
      }
    );

    req.on("error", reject);

    if (bodyData) {
      req.write(JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function runIntegrationTests() {
  console.log("==================================================");
  console.log("INTEGRATION TESTS: Auth & Task-Mutation Endpoints");
  console.log("==================================================\n");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    // -------------------------------------------------------------
    // 1. AUTHENTICATION ENDPOINTS
    // -------------------------------------------------------------
    console.log("[Integration Test 1] POST /api/v1/auth/signup - Register new user");
    const testEmail = `integration-${Date.now()}@example.com`;
    const signupRes = await makeRequest(
      server,
      { method: "POST", path: "/api/v1/auth/signup" },
      { name: "Integration User", email: testEmail, password: "Password123!" }
    );
    assert.strictEqual(signupRes.statusCode, 201, "Signup should return 201 Created");
    assert.ok(signupRes.body.tokens?.accessToken, "Should return access token");
    assert.ok(signupRes.body.tokens?.refreshToken, "Should return refresh token");
    console.log("✓ Signup endpoint successfully registers user and issues JWT tokens.");

    console.log("\n[Integration Test 2] POST /api/v1/auth/login - Valid and invalid credentials");
    // Invalid credentials
    const badLoginRes = await makeRequest(
      server,
      { method: "POST", path: "/api/v1/auth/login" },
      { email: testEmail, password: "WrongPassword!" }
    );
    assert.strictEqual(badLoginRes.statusCode, 401, "Invalid password must return 401");
    console.log("✓ Login rejects invalid credentials with 401 Unauthorized.");

    // Valid credentials (Alice - Owner)
    const loginRes = await makeRequest(
      server,
      { method: "POST", path: "/api/v1/auth/login" },
      { email: "alice@example.com", password: "Password123!" }
    );
    assert.strictEqual(loginRes.statusCode, 200, "Valid login should return 200");
    const aliceToken = loginRes.body.tokens.accessToken;
    const aliceRefresh = loginRes.body.tokens.refreshToken;
    assert.ok(aliceToken, "Alice access token present");
    console.log("✓ Login succeeds with 200 OK and returns access + refresh tokens.");

    console.log("\n[Integration Test 3] GET /api/v1/auth/me - Protected session verification");
    const meRes = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/auth/me",
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    assert.strictEqual(meRes.statusCode, 200);
    assert.strictEqual(meRes.body.user.email, "alice@example.com");
    console.log("✓ Protected /auth/me returns authenticated user identity.");

    console.log("\n[Integration Test 4] POST /api/v1/auth/refresh - Token rotation");
    const refreshRes = await makeRequest(
      server,
      { method: "POST", path: "/api/v1/auth/refresh" },
      { refreshToken: aliceRefresh }
    );
    assert.strictEqual(refreshRes.statusCode, 200);
    assert.ok(refreshRes.body.tokens?.accessToken, "Rotated access token present");
    console.log("✓ Refresh token rotation issues new access and refresh pair.");

    // -------------------------------------------------------------
    // 2. WORKSPACE PREPARATION
    // -------------------------------------------------------------
    console.log("\n[Integration Test 5] Fetch active workspace and board");
    const wsListRes = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/workspaces",
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    assert.strictEqual(wsListRes.statusCode, 200);
    const workspace = wsListRes.body.workspaces[0];
    assert.ok(workspace?.id, "Workspace ID must exist");

    const boardsRes = await makeRequest(server, {
      method: "GET",
      path: `/api/v1/workspaces/${workspace.id}/boards`,
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    assert.strictEqual(boardsRes.statusCode, 200);
    const board = boardsRes.body.boards[0];

    const boardDetailRes = await makeRequest(server, {
      method: "GET",
      path: `/api/v1/workspaces/${workspace.id}/boards/${board.id}`,
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    assert.strictEqual(boardDetailRes.statusCode, 200);
    const lists = boardDetailRes.body.board.lists;
    assert.ok(lists.length >= 2, "Board must have at least 2 lists for mutation testing");
    console.log(`✓ Active Workspace: "${workspace.name}", Board: "${board.title}", Lists: ${lists.length}`);

    // -------------------------------------------------------------
    // 3. TASK-MUTATION ENDPOINTS
    // -------------------------------------------------------------
    console.log("\n[Integration Test 6] POST /tasks - Create task in list");
    const createTaskRes = await makeRequest(
      server,
      {
        method: "POST",
        path: `/api/v1/workspaces/${workspace.id}/lists/${lists[0].id}/tasks`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      },
      {
        title: "Integration Test Task",
        description: "Created via automated integration test suite",
        priority: "HIGH",
      }
    );
    assert.strictEqual(createTaskRes.statusCode, 201, "Create task should return 201");
    const createdTask = createTaskRes.body.task;
    assert.strictEqual(createdTask.title, "Integration Test Task");
    assert.strictEqual(createdTask.priority, "HIGH");
    console.log(`✓ Task created: "${createdTask.title}" (ID: ${createdTask.id})`);

    console.log("\n[Integration Test 7] PATCH /tasks/:taskId - Update task title & priority");
    const updateTaskRes = await makeRequest(
      server,
      {
        method: "PATCH",
        path: `/api/v1/workspaces/${workspace.id}/tasks/${createdTask.id}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      },
      {
        title: "Integration Test Task (Updated)",
        priority: "URGENT",
      }
    );
    assert.strictEqual(updateTaskRes.statusCode, 200);
    assert.strictEqual(updateTaskRes.body.task.title, "Integration Test Task (Updated)");
    assert.strictEqual(updateTaskRes.body.task.priority, "URGENT");
    console.log("✓ Task updated successfully.");

    console.log("\n[Integration Test 8] PATCH /tasks/:taskId/move - Move task between lists with new position");
    const moveTaskRes = await makeRequest(
      server,
      {
        method: "PATCH",
        path: `/api/v1/workspaces/${workspace.id}/tasks/${createdTask.id}/move`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      },
      {
        targetListId: lists[1].id,
        newPosition: 4500,
      }
    );
    assert.strictEqual(moveTaskRes.statusCode, 200);
    assert.strictEqual(moveTaskRes.body.task.listId, lists[1].id);
    assert.strictEqual(moveTaskRes.body.task.position, 4500);
    console.log(`✓ Task moved to list "${lists[1].title}" at position 4500.`);

    console.log("\n[Integration Test 9] RBAC Guard: Rejection of task mutation by VIEWER");
    // Login as Charlie (Viewer)
    const charlieLoginRes = await makeRequest(
      server,
      { method: "POST", path: "/api/v1/auth/login" },
      { email: "charlie@example.com", password: "Password123!" }
    );
    const charlieToken = charlieLoginRes.body.tokens.accessToken;

    const viewerMutateRes = await makeRequest(
      server,
      {
        method: "POST",
        path: `/api/v1/workspaces/${workspace.id}/lists/${lists[0].id}/tasks`,
        headers: { Authorization: `Bearer ${charlieToken}` },
      },
      { title: "Unauthorized Viewer Task" }
    );
    assert.strictEqual(viewerMutateRes.statusCode, 403, "Viewer must be rejected with 403");
    console.log("✓ Server-side RBAC rejects VIEWER role mutation with 403 Forbidden.");

    console.log("\n[Integration Test 10] DELETE /tasks/:taskId - Delete task");
    const deleteTaskRes = await makeRequest(server, {
      method: "DELETE",
      path: `/api/v1/workspaces/${workspace.id}/tasks/${createdTask.id}`,
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    assert.strictEqual(deleteTaskRes.statusCode, 200);
    console.log("✓ Task deleted successfully.");

    console.log("\n[Integration Test 11] POST /api/v1/auth/logout - Revoke session");
    const logoutRes = await makeRequest(
      server,
      {
        method: "POST",
        path: "/api/v1/auth/logout",
        headers: { Authorization: `Bearer ${aliceToken}` },
      },
      { refreshToken: aliceRefresh }
    );
    assert.strictEqual(logoutRes.statusCode, 200);
    console.log("✓ Logout endpoint successfully invalidates user session.");

    console.log("\n==================================================");
    console.log("ALL INTEGRATION TESTS PASSED SUCCESSFULLY");
    console.log("==================================================");
    process.exit(0);
  } finally {
    server.close();
  }
}

runIntegrationTests().catch((err) => {
  console.error("Integration test failure:", err);
  process.exit(1);
});
