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

async function runRouteTests() {
  console.log("=== RUNNING API ENDPOINT & MIDDLEWARE TESTS ===\n");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    // 1. Health route
    console.log("[Test 1] Testing GET /health...");
    const healthRes = await makeRequest(server, { method: "GET", path: "/health" });
    assert.strictEqual(healthRes.statusCode, 200);
    assert.strictEqual(healthRes.body.status, "ok");
    console.log("✓ GET /health is working.");

    // 2. Protected Route without token
    console.log("\n[Test 2] Testing GET /api/v1/auth/me without token (should be 401)...");
    const unauthRes = await makeRequest(server, { method: "GET", path: "/api/v1/auth/me" });
    assert.strictEqual(unauthRes.statusCode, 401);
    assert.strictEqual(unauthRes.body.error, "Unauthorized");
    console.log("✓ Protected route successfully rejects missing token with 401.");

    // 3. Protected Route with invalid token
    console.log("\n[Test 3] Testing GET /api/v1/auth/me with invalid token (should be 401)...");
    const invalidRes = await makeRequest(server, {
      method: "GET",
      path: "/api/v1/auth/me",
      headers: { Authorization: "Bearer bogus.token.value" },
    });
    assert.strictEqual(invalidRes.statusCode, 401);
    assert.strictEqual(invalidRes.body.error, "Unauthorized");
    console.log("✓ Protected route successfully rejects invalid token with 401.");

    // 4. Signup validation failure
    console.log("\n[Test 4] Testing POST /api/v1/auth/signup with invalid email...");
    const badSignupRes = await makeRequest(
      server,
      { method: "POST", path: "/api/v1/auth/signup" },
      { email: "invalid-email", password: "123", name: "Test" }
    );
    assert.strictEqual(badSignupRes.statusCode, 400);
    console.log("✓ Signup validation properly rejects bad input with 400.");

    // 5. Login validation failure
    console.log("\n[Test 5] Testing POST /api/v1/auth/login with missing password...");
    const badLoginRes = await makeRequest(
      server,
      { method: "POST", path: "/api/v1/auth/login" },
      { email: "test@example.com" }
    );
    assert.strictEqual(badLoginRes.statusCode, 400);
    console.log("✓ Login validation properly rejects missing credentials with 400.");

    // 6. Refresh validation failure
    console.log("\n[Test 6] Testing POST /api/v1/auth/refresh without token...");
    const badRefreshRes = await makeRequest(
      server,
      { method: "POST", path: "/api/v1/auth/refresh" },
      {}
    );
    assert.strictEqual(badRefreshRes.statusCode, 400);
    console.log("✓ Refresh endpoint rejects missing token with 400.");

    console.log("\n=== ALL ROUTE & MIDDLEWARE TESTS PASSED SUCCESSFULLY ===");
  } finally {
    server.close();
  }
}

runRouteTests().catch((err) => {
  console.error("Route test failed:", err);
  process.exit(1);
});
