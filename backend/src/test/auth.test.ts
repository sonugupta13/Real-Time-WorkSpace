import assert from "assert";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../utils/token";

async function runAuthTests() {
  console.log("=== RUNNING AUTHENTICATION VERIFICATION TESTS ===\n");

  // Test 1: Password hashing and comparison
  console.log("[Test 1] Hashing and verifying passwords...");
  const rawPassword = "SuperSecurePassword123!";
  const hash = await hashPassword(rawPassword);
  assert.notStrictEqual(rawPassword, hash, "Hash must not equal raw password");
  assert.strictEqual(hash.startsWith("$2"), true, "Hash should be a bcrypt string");

  const isMatch = await comparePassword(rawPassword, hash);
  assert.strictEqual(isMatch, true, "Matching password should verify to true");

  const isWrongMatch = await comparePassword("WrongPassword!", hash);
  assert.strictEqual(isWrongMatch, false, "Wrong password should verify to false");
  console.log("✓ Password hashing & bcrypt verification passed.");

  // Test 2: Access Token generation & verification
  console.log("\n[Test 2] Generating and verifying Access Token...");
  const userPayload = { userId: "user-uuid-1234", email: "developer@example.com" };
  const accessToken = generateAccessToken(userPayload);
  assert.strictEqual(typeof accessToken, "string", "Access token must be a string");

  const decodedAccess = verifyAccessToken(accessToken);
  assert.strictEqual(decodedAccess.userId, userPayload.userId);
  assert.strictEqual(decodedAccess.email, userPayload.email);
  console.log("✓ Access Token generation & verification passed.");

  // Test 3: Refresh Token generation & verification
  console.log("\n[Test 3] Generating and verifying Refresh Token...");
  const refreshPayload = { userId: "user-uuid-1234", tokenId: "token-uuid-5678" };
  const refreshToken = generateRefreshToken(refreshPayload);
  assert.strictEqual(typeof refreshToken, "string", "Refresh token must be a string");

  const decodedRefresh = verifyRefreshToken(refreshToken);
  assert.strictEqual(decodedRefresh.userId, refreshPayload.userId);
  assert.strictEqual(decodedRefresh.tokenId, refreshPayload.tokenId);
  console.log("✓ Refresh Token generation & verification passed.");

  // Test 4: Tampered token rejection
  console.log("\n[Test 4] Verifying rejection of tampered tokens...");
  const tamperedToken = accessToken.slice(0, -6) + "abcdef";
  let caughtTampered = false;
  try {
    verifyAccessToken(tamperedToken);
  } catch {
    caughtTampered = true;
  }
  assert.strictEqual(caughtTampered, true, "Tampered token must be rejected");
  console.log("✓ Tampered token properly rejected with signature error.");

  console.log("\n=== ALL AUTH UTILITY TESTS PASSED SUCCESSFULLY ===");
}

runAuthTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
