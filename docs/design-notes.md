# Real-Time Collaborative Workspace: Architecture & Design Notes

## 1. Domain Modeling Overview

The application is structured around hierarchical collaborative workspaces with explicit role-based access boundaries.

```
User (Account)
 │
 ├── Member of ──► Workspace (Multi-tenant boundary)
                    │
                    ├── WorkspaceMember (Role: OWNER | ADMIN | MEMBER | VIEWER)
                    │
                    └── Board (Kanban / Project Board)
                         │
                         └── List (Columns: e.g., Backlog, In Progress, Done)
                              │
                              └── Task (Actionable items, assigned users, due dates)
```

---

## 2. Core Entities

### A. Users
- **Purpose**: Authenticated identities within the system.
- **Attributes**: `id` (UUID), `email`, `passwordHash`, `name`, `avatarUrl`, `refreshToken`, `createdAt`, `updatedAt`.
- **Relationship**:
  - A user can create/own multiple workspaces.
  - A user can be invited to multiple workspaces via `WorkspaceMember`.
  - A user can be assigned to multiple tasks across workspaces.

### B. Workspaces
- **Purpose**: The primary multi-tenant isolation unit. All boards, lists, and tasks belong to a specific workspace.
- **Attributes**: `id` (UUID), `name`, `slug` (unique identifier for URLs), `description`, `ownerId`, `createdAt`, `updatedAt`.
- **Boundary**: Data never crosses workspace boundaries. A user must have an active membership in a workspace to access any child resources.

### C. Roles (Role-Based Access Control - RBAC)
Roles define the authorization capabilities of a user within a specific workspace:
- **`OWNER`**: Complete control over the workspace (can delete workspace, transfer ownership, manage billing, manage all members and roles, manage all boards/tasks).
- **`ADMIN`**: Workspace management (can invite/remove members, manage non-owner roles, create/delete boards, manage all tasks).
- **`MEMBER`**: Active collaborator (can create/edit boards, create/update/move lists and tasks, comment, assign tasks).
- **`VIEWER`**: Read-only collaborator (can view boards, lists, tasks, and real-time updates without modification privileges).

### D. Boards
- **Purpose**: Visual Kanban-style project space inside a workspace.
- **Attributes**: `id` (UUID), `workspaceId`, `title`, `description`, `position`, `createdAt`, `updatedAt`.
- **Relationship**: Belongs directly to a Workspace; contains an ordered list of `Lists`.

### E. Lists
- **Purpose**: Represents columns/workflow stages inside a board (e.g., "To Do", "In Progress", "Code Review", "Done").
- **Attributes**: `id` (UUID), `boardId`, `title`, `position` (ordering within the board), `createdAt`, `updatedAt`.
- **Relationship**: Belongs to a Board; contains ordered `Tasks`.

### F. Tasks
- **Purpose**: Individual work cards within a list.
- **Attributes**: `id` (UUID), `listId`, `title`, `description`, `position` (ordering within the list), `priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), `dueDate`, `assigneeId`, `creatorId`, `createdAt`, `updatedAt`.
- **Relationship**: Belongs to a List; tracks creator and assigned collaborator.

---

## 3. Authorization Boundary & Security Model

1. **Authentication Layer**:
   - Short-lived JSON Web Tokens (Access Tokens, e.g., 15 minutes) for API request authentication.
   - Long-lived Refresh Tokens (stored hashed/safely in database or HTTP-only cookies) for silent renewal.

2. **Workspace Boundary Verification**:
   - Every request targeting a board, list, or task must resolve its root `workspaceId`.
   - The authorization middleware validates that `req.user.id` has an active `WorkspaceMember` record for that `workspaceId`.

3. **RBAC Guard Matrix**:
   | Action | OWNER | ADMIN | MEMBER | VIEWER |
   |---|:---:|:---:|:---:|:---:|
   | Delete Workspace | ✅ | ❌ | ❌ | ❌ |
   | Manage Members & Roles | ✅ | ✅ | ❌ | ❌ |
   | Create / Delete Boards | ✅ | ✅ | ✅ | ❌ |
   | Create / Move / Edit Tasks | ✅ | ✅ | ✅ | ❌ |
   | View Boards & Real-Time Sync | ✅ | ✅ | ✅ | ✅ |

4. **Real-Time WebSockets Boundary (Prepared for Future Phase)**:
   - Socket.IO connection authenticated via JWT during handshake.
   - Client joins workspace/board rooms (e.g., `board:<boardId>`) only after verifying workspace membership.
   - Real-time updates (task moved, card updated) broadcast strictly within the room.
