# Real-Time Collaborative Workspace with Role-Based Access Control

A high-concurrency, multi-tenant collaborative workspace engineered for enterprise task management, fine-grained role-based authorization (RBAC), and sub-second real-time synchronization.

---

## 📌 Submission Summary

- **GitHub Repository**: Multi-tenant full-stack monorepo
- **CI / Build Status**: Passing GitHub Actions Workflow (`.github/workflows/ci.yml`)
- **Frontend Deployment (Vercel)**: `https://collabspace-workspace.vercel.app` (or custom Vercel URL)
- **Backend Deployment (Render)**: `https://workspace-backend.onrender.com`
- **Hosted Database**: Managed PostgreSQL (Render PostgreSQL / Neon / Supabase DB)
- **Hosted Cache & Queue**: Managed Redis (Render Redis / Upstash)
- **Preconfigured Test Accounts**:
  - **Account 1 (Owner)**: `sonu@example.com` / `Password123!` (Name: **Sonu Gupta**, Role: `OWNER` — Full control, member invites, role management, task CRUD)
  - **Account 2 (Member)**: `niraj@example.com` / `Password123!` (Name: **Niraj Kumar Sahani**, Role: `MEMBER` — Normal task management, moves, ordering; no member administration)
  - **Account 3 (Viewer)**: `aryan@example.com` / `Password123!` (Name: **Aryan Kumar**, Role: `VIEWER` — Read-only observation mode; all mutations blocked)

---

## 🏗 Architecture Overview

The platform uses a decoupled client-server architecture with strict multi-tenant data isolation, event-driven WebSocket broadcasting, and Redis-backed caching and asynchronous processing.

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 14 Frontend                      │
│        (App Router, TypeScript, Pure Vanilla CSS)           │
└──────────────┬───────────────────────────────▲──────────────┘
               │ HTTP REST Requests             │ WebSocket (Socket.IO)
               │ (JWT Bearer Auth)              │ Room Broadcasts
               ▼                               │
┌──────────────────────────────────────────────┴──────────────┐
│                    Express Backend API                      │
│        (TypeScript, Strict Server-Side RBAC Middleware)     │
└──────────────┬───────────────────────────────┬──────────────┘
               │ Prisma ORM                    │ BullMQ & ioredis
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│    PostgreSQL Database      │ │        Redis 7              │
│ - Tenant-isolated tables    │ │ - Workspace Summary Cache   │
│ - Fractional positions      │ │ - BullMQ Export Job Queue   │
│ - Immutable activity logs   │ │ - Distributed locking       │
└─────────────────────────────┘ └─────────────────────────────┘
```

---

## 🗄 Data Model & Multi-Tenancy

Every database query enforces tenant scoping through mandatory `workspaceId` foreign keys and composite unique indexes. Workspace A data is cryptographically and logically inaccessible to Workspace B.

```
User (1) ──────────< (N) WorkspaceMember (N) >────────── (1) Workspace
 │                              │                               │
 │                              │ Role: OWNER, ADMIN,           │
 │                              │       MEMBER, VIEWER          │
 │                                                              │
 ├──────────< (N) RefreshToken (1:N)                            ├──────────< (N) Board (1:N)
 │                                                              │                 │
 ├──────────< (N) ActivityLog (1:N)                             │                 ▼
 │                                                              │           (N) List (1:N)
 └──────────< (N) Task (Creator / Assignee)                     │                 │
                                                                │                 ▼
                                                                └──────────< (N) Task (1:N)
```

### Models:
1. **User**: Authentication credentials (bcrypt password hash salt 12), profile information.
2. **RefreshToken**: Stateful session management with token family rotation and revocation tracking.
3. **Workspace**: Top-level tenant boundary. Owns boards, lists, tasks, members, and activity logs.
4. **WorkspaceMember**: Maps users to workspaces with specific roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
5. **Board**: Container for ordered lists within a workspace.
6. **List**: Workflow columns (e.g., "To Do", "In Progress", "Done") with explicit fractional positions.
7. **Task**: Actionable items with title, description, priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), persistent float positions, and assignee.
8. **ActivityLog**: Immutable audit record tracking actors, mutation actions (`TASK_CREATED`, `TASK_MOVED`, etc.), and JSON metadata.

---

## 🛡 Authorization & Server-Side RBAC

Frontend button hiding is **never treated as security**. Authorization is strictly enforced server-side on every request via `requireWorkspaceRole` middleware.

### Permission Matrix:

| Capability | OWNER | ADMIN | MEMBER | VIEWER |
|---|:---:|:---:|:---:|:---:|
| View Workspace, Boards & Tasks | ✅ | ✅ | ✅ | ✅ |
| Create, Edit & Move Tasks | ✅ | ✅ | ✅ | ❌ (403) |
| Delete Tasks | ✅ | ✅ | ✅ | ❌ (403) |
| Create & Delete Lists / Boards | ✅ | ✅ | ❌ (403) | ❌ (403) |
| Invite Collaborators | ✅ | ✅ | ❌ (403) | ❌ (403) |
| Change Member Roles | ✅ | ✅ (Members & Viewers only) | ❌ (403) | ❌ (403) |
| Remove Members | ✅ | ✅ (Non-admins only) | ❌ (403) | ❌ (403) |
| Delete Workspace | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |

---

## 🔐 Authentication & Session Security

- **Short-Lived Access Tokens**: Signed JWT with 15-minute expiration containing `userId` and `email`.
- **Stateful Refresh Tokens**: Cryptographically random 64-byte tokens stored in database with 7-day expiration.
- **Refresh Token Rotation**: Each `/api/v1/auth/refresh` invocation revokes the used token and issues a new pair.
- **Reuse Detection**: If a revoked refresh token is presented, the backend identifies potential token theft and revokes all active sessions for that user.
- **Password Security**: Hashed using `bcryptjs` with salt round cost factor 12.

---

## ⚡ Real-Time WebSockets (Socket.IO)

- **Handshake Authentication**: Clients authenticate during handshake using Bearer JWT tokens.
- **Scoped Rooms**: Sockets join room `board:<boardId>` only after verifying valid workspace membership.
- **Post-Commit Broadcast**: Mutations execute inside PostgreSQL transactions first. WebSockets emit events only **after** the database transaction commits successfully.
- **Synchronized Events**:
  - `task:created`
  - `task:updated`
  - `task:moved`
  - `task:deleted`
- **Sub-Second Latency**: Remote connected clients view updates in `< 1s` without polling.

---

## 🔀 Task Ordering & Concurrency Logic

- **Fractional Midpoint Algorithm**: Reordering tasks calculates a floating-point midpoint:
  $$\text{position} = \frac{\text{prevPosition} + \text{nextPosition}}{2}$$
- **$O(1)$ Reorder Complexity**: Moving a task between cards updates exactly **one row** in PostgreSQL, eliminating competing table locks and transaction deadlocks during concurrent drag-and-drop operations.
- **Edge Conditions**:
  - Prepending before the first item: $\text{position} = \frac{\text{nextPosition}}{2}$
  - Appending after the last item: $\text{position} = \text{prevPosition} + 1000$

---

## 🚀 Redis Caching & BullMQ Background Queue

1. **Workspace Summary Cache**:
   - `GET /api/v1/workspaces/:workspaceId/summary` computes aggregate board, task, and priority metrics.
   - Cached in Redis (`cache:workspace:<id>:summary`) with 300s TTL.
   - **Active Invalidation**: Any task creation, move, or deletion triggers `invalidateWorkspaceSummaryCache` to prevent stale metrics.
2. **Asynchronous BullMQ Queue**:
   - `POST /api/v1/workspaces/:workspaceId/boards/:boardId/export` enqueues board export jobs to Redis-backed BullMQ workers.
   - Returns immediate `202 Accepted` with `jobId`.
   - Polling endpoint `GET /.../export/:jobId` reports `waiting`, `active`, and `completed` status with downloadable JSON.

---

## 🐳 Docker & Docker Compose Setup

Run the entire four-tier stack (PostgreSQL, Redis, Express Backend, Next.js Frontend) with a single command:

```bash
# 1. Clone repository
git clone https://github.com/your-username/realtime-workspace.git
cd realtime-workspace

# 2. Configure environment
cp .env.example .env

# 3. Spin up all services
docker compose up --build
```

### Verified Endpoints:
- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5000/api/v1](http://localhost:5000/api/v1)
- **Backend Health Check**: [http://localhost:5000/health](http://localhost:5000/health)
- **PostgreSQL Database**: `localhost:5432`
- **Redis Cache**: `localhost:6379`

To stop the containers:
```bash
docker compose down
```

---

## 💻 Local Development (Outside Docker)

### Prerequisites:
- Node.js v20+
- PostgreSQL and Redis (or run backend in resilient local dev mode)

### Backend:
```bash
cd backend
npm install
npx prisma generate
npm run dev
```

### Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Automated Testing Suite

The project includes unit, integration, and E2E verification suites:

```bash
cd backend
npm test
```

### Test Coverage:
1. **Unit Tests (`src/test/unit.test.ts`)**:
   - Fractional position math (empty, prepend, append, midpoint, nested inserts).
   - Concurrent drag-and-drop deterministic ordering.
   - Server-side RBAC guards (Owner full access, Admin delegation, Member task mutations, Viewer 403 rejection).
   - Tenant boundary cross-workspace rejection.
   - Cryptographic password hashing and JWT signatures.
2. **Integration Tests (`src/test/integration.test.ts`)**:
   - `POST /api/v1/auth/signup` (registration and token issuance).
   - `POST /api/v1/auth/login` (validation and credential verification).
   - `GET /api/v1/auth/me` (session verification).
   - `POST /api/v1/auth/refresh` (token rotation).
   - `POST /tasks` (task creation in list).
   - `PATCH /tasks/:taskId` (task attribute updates).
   - `PATCH /tasks/:taskId/move` (movement between lists with position calculations).
   - `DELETE /tasks/:taskId` (task deletion).
   - `POST /api/v1/auth/logout` (session invalidation).
3. **End-to-End Multi-Window Verification (`src/test/verify-e2e.ts`)**:
   - Dual-window real-time WebSocket sync verifying remote delivery in `< 1s`.

---

## ⚙️ Environment Variables

### Backend (`backend/.env`):
| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | API server port | `5000` |
| `NODE_ENV` | Environment mode | `production` / `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/workspace_db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret key for access JWTs | Strong random string |
| `JWT_REFRESH_SECRET` | Secret key for refresh JWTs | Strong random string |
| `ACCESS_TOKEN_EXPIRES_IN` | Access token lifespan | `15m` |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token lifespan | `7d` |
| `CORS_ORIGIN` | Allowed client origin | `http://localhost:3000` / Vercel domain |

### Frontend (`frontend/.env`):
| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | Next.js server port | `3000` |
| `NEXT_PUBLIC_API_URL` | Backend REST endpoint | `http://localhost:5000/api/v1` |
| `NEXT_PUBLIC_WS_URL` | Backend WebSocket endpoint | `http://localhost:5000` |

---

## 🌐 Production Deployment Guide

### Frontend Deployment (Vercel):
1. Import repository into Vercel.
2. Set Root Directory to `frontend`.
3. Add Environment Variables:
   - `NEXT_PUBLIC_API_URL`: `https://workspace-backend.onrender.com/api/v1`
   - `NEXT_PUBLIC_WS_URL`: `https://workspace-backend.onrender.com`
4. Deploy.

### Backend Deployment (Render):
1. In Render, select **New -> Blueprint** and connect this repository using `render.yaml`.
2. Alternatively, create a **Web Service**:
   - Root Directory: `backend`
   - Build Command: `npm ci && npx prisma generate && npm run build`
   - Start Command: `npx prisma migrate deploy && npm start`
   - Add Environment Variables for `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `CORS_ORIGIN`.

---

## ⚖️ Architectural Trade-Offs & Known Limitations

1. **Fractional Number Floating-Point Precision**:
   - *Trade-off*: Floating point positions allow $O(1)$ reorders without rewriting subsequent rows.
   - *Boundary*: If hundreds of consecutive drops occur between the exact same two tasks without reindexing, floating-point precision limits can theoretically be approached. A normalization re-index job can run periodically in production if delta $< 0.0001$.
2. **Socket.IO Sticky Sessions in Horizontal Scaling**:
   - *Trade-off*: Socket.IO runs in-process with room broadcasting.
   - *Production path*: When scaling the backend across multiple container instances, `@socket.io/redis-adapter` is recommended so broadcasts cross pod boundaries via Redis Pub/Sub.
3. **Vanilla CSS Design System**:
   - *Trade-off*: Handcrafted CSS avoids heavy CSS framework bloat and provides complete layout control with the Odysseus AI Light Cream palette. Component libraries (such as Shadcn or Tailwind) were intentionally excluded per assignment requirements.
