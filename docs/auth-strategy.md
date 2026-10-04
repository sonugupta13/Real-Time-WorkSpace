# Authentication, Token Storage & Revocation Strategy

## 1. Architectural Overview

The authentication system employs a dual-token design using stateless **JSON Web Tokens (JWT)** for access authorization and stateful, rotatable **Refresh Tokens** stored in PostgreSQL for session management.

```
 Client (Next.js / Browser)                       Server (Express API)
      │                                                   │
      ├──── POST /api/v1/auth/signup or /login ──────────►│ (1) Validate credentials
      │                                                   │ (2) Generate Access Token (15m)
      │                                                   │ (3) Persist Refresh Token (7d)
      │◄─── Returns { accessToken, refreshToken } ────────┤
      │                                                   │
      ├──── GET /api/v1/auth/me (Authorization: Bearer) ─►│ (4) Validate JWT signature & expiry
      │◄─── Returns { user: { id, email, name } } ────────┤
      │                                                   │
   [After 15m - Access Token Expires]                     │
      │                                                   │
      ├──── POST /api/v1/auth/refresh ───────────────────►│ (5) Verify Refresh Token in DB
      │     (Body: { refreshToken })                      │ (6) Revoke old Refresh Token
      │                                                   │ (7) Persist & issue new pair
      │◄─── Returns { newAccessToken, newRefreshToken } ──┤
```

---

## 2. Token Specifications

| Token Type | Lifespan | Format | Storage Location | Purpose |
|---|---|---|---|---|
| **Access Token** | 15 minutes | Signed JWT (`HS256`) | Client memory / App state | Stateless authorization on protected API routes (`req.user`) |
| **Refresh Token** | 7 days | Signed JWT + DB Row | Secure HTTP-Only Cookie or Client Storage & PostgreSQL (`refresh_tokens`) | Long-lived session renewal and device management |

---

## 3. Refresh Token Rotation (RTR) & Reuse Detection

To safeguard against token theft and replay attacks, we implement strict **Refresh Token Rotation**:

1. **One-Time Usage**: Every refresh token can only be used once to obtain a new token pair.
2. **Atomic Invalidation**: Upon calling `POST /api/v1/auth/refresh`, the presented token's `isRevoked` flag is immediately set to `true` in PostgreSQL.
3. **Automatic Reuse Detection**:
   - If a refresh token is presented whose database record already has `isRevoked: true`, the system detects an attack (the token was either stolen or leaked).
   - **Remediation**: The system immediately invalidates **all** active refresh tokens belonging to that user ID:
     ```ts
     await prisma.refreshToken.updateMany({
       where: { userId: storedToken.userId },
       data: { isRevoked: true },
     });
     ```
   - An HTTP `401 Unauthorized` is returned, forcing any attacker or user session to re-authenticate from scratch.

---

## 4. Revocation Strategy & Logout

- **Single Session Logout (`POST /api/v1/auth/logout`)**:
  - Sets `isRevoked: true` on the specific refresh token associated with the current session.
  - The access token expires naturally within 15 minutes and can no longer be refreshed.
- **Global Invalidation (Password Reset / Security Events)**:
  - Updates all rows for the user in `refresh_tokens` to `isRevoked = true`.
  - Instantly prevents all devices/sessions from refreshing access.
