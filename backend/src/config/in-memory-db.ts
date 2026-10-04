import { WorkspaceRole, TaskPriority } from "@prisma/client";

// In-Memory Database store matching Prisma Schema
export class InMemoryPrisma {
  users: any[] = [];
  refreshTokens: any[] = [];
  workspaces: any[] = [];
  workspaceMembers: any[] = [];
  boards: any[] = [];
  lists: any[] = [];
  tasks: any[] = [];
  activityLogs: any[] = [];

  constructor() {
    this.seedDefaultData();
  }

  seedDefaultData() {
    const defaultPasswordHash = "$2a$10$JfiacuJ9zY5DsXa.yxBEB.uZHKw1.KHUoqPQ.fxgj3AqpWpVXYKPW"; // "Password123!"

    // 1. Users (Configured with requested Indian names & roles)
    const sonu = {
      id: "user-sonu-uuid",
      email: "sonu@example.com",
      passwordHash: defaultPasswordHash,
      name: "Sonu Gupta",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const niraj = {
      id: "user-niraj-uuid",
      email: "niraj@example.com",
      passwordHash: defaultPasswordHash,
      name: "Niraj Kumar Sahani",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const aryan = {
      id: "user-aryan-uuid",
      email: "aryan@example.com",
      passwordHash: defaultPasswordHash,
      name: "Aryan Kumar",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Aliases for backward test compatibility
    const alice = {
      id: "user-alice-uuid",
      email: "alice@example.com",
      passwordHash: defaultPasswordHash,
      name: "Sonu Gupta",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const bob = {
      id: "user-bob-uuid",
      email: "bob@example.com",
      passwordHash: defaultPasswordHash,
      name: "Niraj Kumar Sahani",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const charlie = {
      id: "user-charlie-uuid",
      email: "charlie@example.com",
      passwordHash: defaultPasswordHash,
      name: "Aryan Kumar",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.push(sonu, niraj, aryan, alice, bob, charlie);

    // 2. Default Workspace
    const ws = {
      id: "ws-engineering-uuid",
      name: "Engineering Workspace",
      description: "Core Product Engineering Team",
      ownerId: sonu.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.workspaces.push(ws);

    // 3. Memberships
    this.workspaceMembers.push(
      {
        id: "mem-sonu-uuid",
        workspaceId: ws.id,
        userId: sonu.id,
        role: WorkspaceRole.OWNER,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mem-niraj-uuid",
        workspaceId: ws.id,
        userId: niraj.id,
        role: WorkspaceRole.MEMBER,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mem-aryan-uuid",
        workspaceId: ws.id,
        userId: aryan.id,
        role: WorkspaceRole.VIEWER,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mem-alice-uuid",
        workspaceId: ws.id,
        userId: alice.id,
        role: WorkspaceRole.OWNER,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mem-bob-uuid",
        workspaceId: ws.id,
        userId: bob.id,
        role: WorkspaceRole.MEMBER,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mem-charlie-uuid",
        workspaceId: ws.id,
        userId: charlie.id,
        role: WorkspaceRole.VIEWER,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    // 4. Default Board
    const board = {
      id: "board-sprint24-uuid",
      workspaceId: ws.id,
      title: "Sprint 24 Roadmap",
      description: "Q4 Deliverables and Real-Time Infrastructure",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.boards.push(board);

    // 5. Default Lists
    const listTodo = {
      id: "list-todo-uuid",
      workspaceId: ws.id,
      boardId: board.id,
      title: "To Do",
      position: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const listInProgress = {
      id: "list-inprogress-uuid",
      workspaceId: ws.id,
      boardId: board.id,
      title: "In Progress",
      position: 2000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const listDone = {
      id: "list-done-uuid",
      workspaceId: ws.id,
      boardId: board.id,
      title: "Done",
      position: 3000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.lists.push(listTodo, listInProgress, listDone);

    // 6. Default Tasks
    this.tasks.push(
      {
        id: "task-1-uuid",
        workspaceId: ws.id,
        listId: listDone.id,
        title: "Setup Docker Compose & PostgreSQL Schema",
        description: "Configured multi-tenant schema with Prisma migrations",
        priority: TaskPriority.HIGH,
        position: 1000,
        creatorId: alice.id,
        assigneeId: bob.id,
        createdAt: new Date(Date.now() - 3600000 * 4),
        updatedAt: new Date(),
      },
      {
        id: "task-2-uuid",
        workspaceId: ws.id,
        listId: listDone.id,
        title: "Implement Multi-Tenant RBAC Guards",
        description: "Server-side role authorization enforcing Owner/Admin/Member/Viewer rules",
        priority: TaskPriority.URGENT,
        position: 2000,
        creatorId: alice.id,
        assigneeId: alice.id,
        createdAt: new Date(Date.now() - 3600000 * 3),
        updatedAt: new Date(),
      },
      {
        id: "task-3-uuid",
        workspaceId: ws.id,
        listId: listInProgress.id,
        title: "Connect Real-Time WebSockets (Socket.IO)",
        description: "Broadcast task mutations to connected board clients within 1s",
        priority: TaskPriority.HIGH,
        position: 1000,
        creatorId: bob.id,
        assigneeId: bob.id,
        createdAt: new Date(Date.now() - 3600000 * 2),
        updatedAt: new Date(),
      },
      {
        id: "task-4-uuid",
        workspaceId: ws.id,
        listId: listTodo.id,
        title: "HTML5 Drag-and-Drop Task Ordering",
        description: "Test concurrent drag and drop movement with fractional positions",
        priority: TaskPriority.MEDIUM,
        position: 1000,
        creatorId: alice.id,
        assigneeId: null,
        createdAt: new Date(Date.now() - 3600000 * 1),
        updatedAt: new Date(),
      }
    );

    // 7. Initial Activity Log
    this.activityLogs.push({
      id: "act-1-uuid",
      workspaceId: ws.id,
      userId: alice.id,
      action: "WORKSPACE_CREATED",
      entityType: "WORKSPACE",
      entityId: ws.id,
      metadata: { name: ws.name },
      createdAt: new Date(Date.now() - 3600000 * 5),
    });
  }

  // ---------------- User Model ----------------
  user = {
    findUnique: async ({ where, select }: any) => {
      let u = null;
      if (where.email) u = this.users.find((x) => x.email.toLowerCase() === where.email.toLowerCase());
      else if (where.id) u = this.users.find((x) => x.id === where.id);
      if (!u) return null;
      if (select) {
        const res: any = {};
        Object.keys(select).forEach((k) => {
          if (select[k]) res[k] = u[k];
        });
        return res;
      }
      return { ...u };
    },
    findFirst: async ({ where }: any = {}) => {
      const u = this.users.find((x) => {
        if (where?.id && x.id !== where.id) return false;
        if (where?.email && x.email.toLowerCase() !== where.email.toLowerCase()) return false;
        return true;
      });
      return u ? { ...u } : null;
    },
    create: async ({ data, select }: any) => {
      const newUser = {
        id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.push(newUser);
      if (select) {
        const res: any = {};
        Object.keys(select).forEach((k) => {
          if (select[k]) res[k] = newUser[k];
        });
        return res;
      }
      return { ...newUser };
    },
  };

  // ---------------- Refresh Token Model ----------------
  refreshToken = {
    create: async ({ data }: any) => {
      const token = {
        id: `token-${Date.now()}`,
        ...data,
        isRevoked: false,
        createdAt: new Date(),
      };
      this.refreshTokens.push(token);
      return { ...token };
    },
    findUnique: async ({ where }: any) => {
      const t = this.refreshTokens.find((x) => (where.id && x.id === where.id) || (where.token && x.token === where.token));
      return t ? { ...t } : null;
    },
    update: async ({ where, data }: any) => {
      const t = this.refreshTokens.find((x) => x.id === where.id || x.token === where.token);
      if (t) Object.assign(t, data);
      return t ? { ...t } : null;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      this.refreshTokens.forEach((x) => {
        if (where.userId && x.userId === where.userId) {
          Object.assign(x, data);
          count++;
        }
      });
      return { count };
    },
  };

  // ---------------- Workspace Model ----------------
  workspace = {
    create: async ({ data, include }: any) => {
      const ws = {
        id: `ws-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: data.name,
        description: data.description || null,
        ownerId: data.ownerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.workspaces.push(ws);

      // Handle nested members.create
      if (data.members?.create) {
        const memData = data.members.create;
        const member = {
          id: `mem-${Date.now()}`,
          workspaceId: ws.id,
          userId: memData.userId,
          role: memData.role,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.workspaceMembers.push(member);
      }

      return this.formatWorkspace(ws, include);
    },
    findMany: async ({ where, include }: any = {}) => {
      let result = [...this.workspaces];
      if (where?.members?.some?.userId) {
        const uid = where.members.some.userId;
        const wsIds = this.workspaceMembers.filter((m) => m.userId === uid).map((m) => m.workspaceId);
        result = result.filter((ws) => wsIds.includes(ws.id));
      }
      return result.map((ws) => this.formatWorkspace(ws, include));
    },
    findFirst: async ({ where, include }: any = {}) => {
      let result = [...this.workspaces];
      if (where?.id) result = result.filter((w) => w.id === where.id);
      if (where?.members?.some?.userId) {
        const uid = where.members.some.userId;
        const wsIds = this.workspaceMembers.filter((m) => m.userId === uid).map((m) => m.workspaceId);
        result = result.filter((ws) => wsIds.includes(ws.id));
      }
      const ws = result[0];
      return ws ? this.formatWorkspace(ws, include) : null;
    },
    findUnique: async ({ where, include }: any) => {
      const ws = this.workspaces.find((w) => w.id === where.id);
      return ws ? this.formatWorkspace(ws, include) : null;
    },
  };

  private formatWorkspace(ws: any, include: any) {
    const copy = { ...ws };
    if (include?.members) {
      copy.members = this.workspaceMembers
        .filter((m) => m.workspaceId === ws.id)
        .map((m) => {
          const mCopy = { ...m };
          if (include.members.include?.user) {
            const u = this.users.find((x) => x.id === m.userId);
            mCopy.user = u ? { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl } : null;
          }
          return mCopy;
        });
    }
    if (include?.owner) {
      const u = this.users.find((x) => x.id === ws.ownerId);
      copy.owner = u ? { id: u.id, name: u.name, email: u.email } : null;
    }
    if (include?._count?.select) {
      copy._count = {
        boards: this.boards.filter((b) => b.workspaceId === ws.id).length,
        members: this.workspaceMembers.filter((m) => m.workspaceId === ws.id).length,
      };
    }
    return copy;
  }

  // ---------------- WorkspaceMember Model ----------------
  workspaceMember = {
    findUnique: async ({ where, include }: any) => {
      let mem = null;
      if (where.workspaceId_userId) {
        mem = this.workspaceMembers.find(
          (m) =>
            m.workspaceId === where.workspaceId_userId.workspaceId &&
            m.userId === where.workspaceId_userId.userId
        );
      } else if (where.id) {
        mem = this.workspaceMembers.find((m) => m.id === where.id);
      }
      return mem ? this.formatMember(mem, include) : null;
    },
    findFirst: async ({ where, include }: any) => {
      const mem = this.workspaceMembers.find((m) => {
        if (where.id && m.id !== where.id) return false;
        if (where.workspaceId && m.workspaceId !== where.workspaceId) return false;
        if (where.userId && m.userId !== where.userId) return false;
        return true;
      });
      return mem ? this.formatMember(mem, include) : null;
    },
    findMany: async ({ where, include, orderBy }: any = {}) => {
      let list = [...this.workspaceMembers];
      if (where?.workspaceId) list = list.filter((m) => m.workspaceId === where.workspaceId);
      if (where?.userId) list = list.filter((m) => m.userId === where.userId);
      return list.map((m) => this.formatMember(m, include));
    },
    create: async ({ data, include }: any) => {
      const mem = {
        id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        joinedAt: data.joinedAt || new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.workspaceMembers.push(mem);
      return this.formatMember(mem, include);
    },
    update: async ({ where, data, include }: any) => {
      const mem = this.workspaceMembers.find((m) => m.id === where.id);
      if (mem) Object.assign(mem, data);
      return mem ? this.formatMember(mem, include) : null;
    },
    delete: async ({ where }: any) => {
      const idx = this.workspaceMembers.findIndex((m) => m.id === where.id);
      if (idx !== -1) {
        const removed = this.workspaceMembers.splice(idx, 1)[0];
        return removed;
      }
      return null;
    },
  };

  private formatMember(m: any, include: any) {
    const copy = { ...m, joinedAt: m.joinedAt || m.createdAt || new Date() };
    if (include?.user) {
      const u = this.users.find((x) => x.id === m.userId);
      copy.user = u ? { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl } : null;
    }
    if (include?.workspace) {
      const ws = this.workspaces.find((w) => w.id === m.workspaceId);
      copy.workspace = ws ? this.formatWorkspace(ws, include.workspace.include) : null;
    }
    return copy;
  }

  // ---------------- Board Model ----------------
  board = {
    create: async ({ data }: any) => {
      const b = {
        id: `board-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.boards.push(b);
      return { ...b };
    },
    findMany: async ({ where, include }: any = {}) => {
      let list = [...this.boards];
      if (where?.workspaceId) list = list.filter((b) => b.workspaceId === where.workspaceId);
      return list.map((b) => this.formatBoard(b, include));
    },
    findFirst: async ({ where, include }: any = {}) => {
      const b = this.boards.find((x) => {
        if (where.id && x.id !== where.id) return false;
        if (where.workspaceId && x.workspaceId !== where.workspaceId) return false;
        return true;
      });
      return b ? this.formatBoard(b, include) : null;
    },
  };

  private formatBoard(b: any, include: any) {
    const copy = { ...b };
    if (include?.lists) {
      copy.lists = this.lists
        .filter((l) => l.boardId === b.id)
        .sort((a, b) => a.position - b.position)
        .map((l) => {
          const lCopy = { ...l };
          if (include.lists.include?.tasks) {
            lCopy.tasks = this.tasks
              .filter((t) => t.listId === l.id)
              .sort((a, b) => a.position - b.position)
              .map((t) => this.formatTask(t, include.lists.include.tasks.include));
          }
          return lCopy;
        });
    }
    return copy;
  }

  // ---------------- List Model ----------------
  list = {
    create: async ({ data }: any) => {
      const l = {
        id: `list-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.lists.push(l);
      return { ...l };
    },
    findMany: async ({ where, orderBy, include }: any = {}) => {
      let res = [...this.lists];
      if (where?.boardId) res = res.filter((l) => l.boardId === where.boardId);
      if (where?.workspaceId) res = res.filter((l) => l.workspaceId === where.workspaceId);
      if (orderBy?.position === "asc") res.sort((a, b) => a.position - b.position);
      return res.map((l) => {
        const copy = { ...l };
        if (include?.tasks) {
          copy.tasks = this.tasks
            .filter((t) => t.listId === l.id)
            .sort((a, b) => a.position - b.position)
            .map((t) => this.formatTask(t, include.tasks.include));
        }
        return copy;
      });
    },
    findFirst: async ({ where, orderBy }: any = {}) => {
      let res = [...this.lists];
      if (where?.id) res = res.filter((l) => l.id === where.id);
      if (where?.boardId) res = res.filter((l) => l.boardId === where.boardId);
      if (where?.workspaceId) res = res.filter((l) => l.workspaceId === where.workspaceId);
      if (orderBy?.position === "desc") res.sort((a, b) => b.position - a.position);
      return res[0] ? { ...res[0] } : null;
    },
    update: async ({ where, data }: any) => {
      const l = this.lists.find((x) => x.id === where.id);
      if (l) Object.assign(l, data);
      return l ? { ...l } : null;
    },
    delete: async ({ where }: any) => {
      const idx = this.lists.findIndex((x) => x.id === where.id);
      if (idx !== -1) {
        const removed = this.lists.splice(idx, 1)[0];
        // Also remove associated tasks
        this.tasks = this.tasks.filter((t) => t.listId !== where.id);
        return removed;
      }
      return null;
    },
  };

  // ---------------- Task Model ----------------
  task = {
    create: async ({ data, include }: any) => {
      const t = {
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.tasks.push(t);
      return this.formatTask(t, include);
    },
    findFirst: async ({ where, include, orderBy }: any = {}) => {
      let res = [...this.tasks];
      if (where?.id) res = res.filter((t) => t.id === where.id);
      if (where?.workspaceId) res = res.filter((t) => t.workspaceId === where.workspaceId);
      if (where?.listId) res = res.filter((t) => t.listId === where.listId);
      if (orderBy?.position === "desc") res.sort((a, b) => b.position - a.position);
      return res[0] ? this.formatTask(res[0], include) : null;
    },
    findMany: async ({ where, include, orderBy, skip = 0, take = 50 }: any = {}) => {
      let res = [...this.tasks];
      if (where?.workspaceId) res = res.filter((t) => t.workspaceId === where.workspaceId);
      if (where?.listId) res = res.filter((t) => t.listId === where.listId);
      if (where?.priority) res = res.filter((t) => t.priority === where.priority);
      if (where?.assigneeId) res = res.filter((t) => t.assigneeId === where.assigneeId);
      if (where?.OR) {
        res = res.filter((t) => {
          return where.OR.some((cond: any) => {
            if (cond.title?.contains) {
              const q = cond.title.contains.toLowerCase();
              return t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q));
            }
            return false;
          });
        });
      }
      if (orderBy?.position === "asc") res.sort((a, b) => a.position - b.position);
      else if (orderBy?.createdAt === "desc") res.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return res.slice(skip, skip + take).map((t) => this.formatTask(t, include));
    },
    update: async ({ where, data, include }: any) => {
      const t = this.tasks.find((x) => x.id === where.id);
      if (t) {
        Object.assign(t, data);
        t.updatedAt = new Date();
      }
      return t ? this.formatTask(t, include) : null;
    },
    delete: async ({ where }: any) => {
      const idx = this.tasks.findIndex((x) => x.id === where.id);
      if (idx !== -1) {
        return this.tasks.splice(idx, 1)[0];
      }
      return null;
    },
    count: async ({ where }: any = {}) => {
      let res = [...this.tasks];
      if (where?.workspaceId) res = res.filter((t) => t.workspaceId === where.workspaceId);
      if (where?.priority) res = res.filter((t) => t.priority === where.priority);
      if (where?.assigneeId) res = res.filter((t) => t.assigneeId === where.assigneeId);
      if (where?.OR) {
        res = res.filter((t) => {
          return where.OR.some((cond: any) => {
            if (cond.title?.contains) {
              const q = cond.title.contains.toLowerCase();
              return t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q));
            }
            return false;
          });
        });
      }
      return res.length;
    },
    groupBy: async ({ by, where, _count }: any) => {
      const map: Record<string, number> = {};
      this.tasks
        .filter((t) => !where?.workspaceId || t.workspaceId === where.workspaceId)
        .forEach((t) => {
          const val = t[by[0]] || "UNKNOWN";
          map[val] = (map[val] || 0) + 1;
        });
      return Object.entries(map).map(([priority, count]) => ({
        priority,
        _count: { _all: count },
      }));
    },
  };

  private formatTask(t: any, include: any) {
    const copy = { ...t };
    if (include?.assignee) {
      const u = this.users.find((x) => x.id === t.assigneeId);
      copy.assignee = u ? { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl } : null;
    }
    if (include?.creator) {
      const u = this.users.find((x) => x.id === t.creatorId);
      copy.creator = u ? { id: u.id, email: u.email, name: u.name } : null;
    }
    if (include?.list) {
      const l = this.lists.find((x) => x.id === t.listId);
      const b = l ? this.boards.find((x) => x.id === l.boardId) : null;
      copy.list = l
        ? {
            id: l.id,
            title: l.title,
            boardId: l.boardId,
            board: b ? { id: b.id, title: b.title } : null,
          }
        : null;
    }
    return copy;
  }

  // ---------------- ActivityLog Model ----------------
  activityLog = {
    create: async ({ data }: any) => {
      const act = {
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        createdAt: new Date(),
      };
      this.activityLogs.unshift(act);
      return { ...act };
    },
    findMany: async ({ where, include, orderBy, skip = 0, take = 20 }: any = {}) => {
      let list = [...this.activityLogs];
      if (where?.workspaceId) list = list.filter((a) => a.workspaceId === where.workspaceId);
      if (orderBy?.createdAt === "desc") list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return list.slice(skip, skip + take).map((a) => {
        const copy = { ...a };
        if (include?.user) {
          const u = this.users.find((x) => x.id === a.userId);
          copy.user = u ? { id: u.id, email: u.email, name: u.name } : null;
        }
        return copy;
      });
    },
    count: async ({ where }: any = {}) => {
      let list = [...this.activityLogs];
      if (where?.workspaceId) list = list.filter((a) => a.workspaceId === where.workspaceId);
      return list.length;
    },
  };

  // Transaction support
  async $transaction(fn: any) {
    if (typeof fn === "function") {
      return fn(this);
    }
    return Promise.all(fn);
  }
}
