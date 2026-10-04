const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

interface RequestOptions extends RequestInit {
  token?: string | null;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<{ data: T; error: null } | { data: null; error: string; status: number }> {
  const { token, headers = {}, ...rest } = options;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  try {
    const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      ...rest,
      headers: reqHeaders,
    });

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const errorMessage =
        (typeof body === "object" && body?.message) ||
        (typeof body === "object" && body?.error) ||
        `Request failed with status ${res.status}`;
      return { data: null, error: errorMessage, status: res.status };
    }

    return { data: body, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || "Network error. Please check server.", status: 0 };
  }
}

// --------------------------------------------------------
// Auth API Service
// --------------------------------------------------------
export const authApi = {
  signup: (data: { email: string; password: string; name: string }) =>
    apiRequest<{ user: any; tokens: { accessToken: string; refreshToken: string } }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    apiRequest<{ user: any; tokens: { accessToken: string; refreshToken: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  refresh: (refreshToken: string) =>
    apiRequest<{ tokens: { accessToken: string; refreshToken: string } }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  getMe: (token: string) =>
    apiRequest<{ user: any }>("/auth/me", {
      method: "GET",
      token,
    }),

  logout: (token?: string, refreshToken?: string) =>
    apiRequest("/auth/logout", {
      method: "POST",
      token,
      body: JSON.stringify({ refreshToken }),
    }),
};

// --------------------------------------------------------
// Workspace API Service
// --------------------------------------------------------
export const workspaceApi = {
  create: (token: string, data: { name: string; description?: string }) =>
    apiRequest<{ workspace: any }>("/workspaces", {
      method: "POST",
      token,
      body: JSON.stringify(data),
    }),

  listMyWorkspaces: (token: string) =>
    apiRequest<{ workspaces: any[] }>("/workspaces", {
      method: "GET",
      token,
    }),

  getDetails: (token: string, workspaceId: string) =>
    apiRequest<{ workspace: any }>(`/workspaces/${workspaceId}`, {
      method: "GET",
      token,
    }),

  getSummary: (token: string, workspaceId: string) =>
    apiRequest<{ source: "cache" | "database"; summary: any }>(`/workspaces/${workspaceId}/summary`, {
      method: "GET",
      token,
    }),

  getActivity: (token: string, workspaceId: string, page = 1, limit = 20) =>
    apiRequest<{ activities: any[]; pagination: any }>(
      `/workspaces/${workspaceId}/activity?page=${page}&limit=${limit}`,
      {
        method: "GET",
        token,
      }
    ),
};

// --------------------------------------------------------
// Members & RBAC API Service
// --------------------------------------------------------
export const memberApi = {
  list: (token: string, workspaceId: string) =>
    apiRequest<{ members: any[] }>(`/workspaces/${workspaceId}/members`, {
      method: "GET",
      token,
    }),

  invite: (token: string, workspaceId: string, data: { email: string; role: string }) =>
    apiRequest<{ member: any }>(`/workspaces/${workspaceId}/members`, {
      method: "POST",
      token,
      body: JSON.stringify(data),
    }),

  updateRole: (token: string, workspaceId: string, memberId: string, role: string) =>
    apiRequest<{ member: any }>(`/workspaces/${workspaceId}/members/${memberId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ role }),
    }),

  remove: (token: string, workspaceId: string, memberId: string) =>
    apiRequest(`/workspaces/${workspaceId}/members/${memberId}`, {
      method: "DELETE",
      token,
    }),
};

// --------------------------------------------------------
// Board API Service
// --------------------------------------------------------
export const boardApi = {
  create: (token: string, workspaceId: string, data: { title: string; description?: string }) =>
    apiRequest<{ board: any }>(`/workspaces/${workspaceId}/boards`, {
      method: "POST",
      token,
      body: JSON.stringify(data),
    }),

  list: (token: string, workspaceId: string) =>
    apiRequest<{ boards: any[] }>(`/workspaces/${workspaceId}/boards`, {
      method: "GET",
      token,
    }),

  getDetails: (token: string, workspaceId: string, boardId: string) =>
    apiRequest<{ board: any }>(`/workspaces/${workspaceId}/boards/${boardId}`, {
      method: "GET",
      token,
    }),

  triggerExport: (token: string, workspaceId: string, boardId: string) =>
    apiRequest<{ jobId: string; status: string; statusUrl: string }>(
      `/workspaces/${workspaceId}/boards/${boardId}/export`,
      {
        method: "POST",
        token,
      }
    ),

  getExportStatus: (token: string, workspaceId: string, boardId: string, jobId: string) =>
    apiRequest<any>(`/workspaces/${workspaceId}/boards/${boardId}/export/${jobId}`, {
      method: "GET",
      token,
    }),
};

// --------------------------------------------------------
// List API Service
// --------------------------------------------------------
export const listApi = {
  create: (token: string, workspaceId: string, boardId: string, title: string) =>
    apiRequest<{ list: any }>(`/workspaces/${workspaceId}/boards/${boardId}/lists`, {
      method: "POST",
      token,
      body: JSON.stringify({ title }),
    }),

  update: (token: string, workspaceId: string, listId: string, title: string) =>
    apiRequest<{ list: any }>(`/workspaces/${workspaceId}/lists/${listId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ title }),
    }),

  delete: (token: string, workspaceId: string, listId: string) =>
    apiRequest(`/workspaces/${workspaceId}/lists/${listId}`, {
      method: "DELETE",
      token,
    }),
};

// --------------------------------------------------------
// Task API Service
// --------------------------------------------------------
export const taskApi = {
  create: (token: string, workspaceId: string, listId: string, taskData: any) =>
    apiRequest<{ task: any }>(`/workspaces/${workspaceId}/lists/${listId}/tasks`, {
      method: "POST",
      token,
      body: JSON.stringify(taskData),
    }),

  update: (token: string, workspaceId: string, taskId: string, taskData: any) =>
    apiRequest<{ task: any }>(`/workspaces/${workspaceId}/tasks/${taskId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(taskData),
    }),

  move: (token: string, workspaceId: string, taskId: string, data: { targetListId?: string; newPosition?: number; prevPosition?: number; nextPosition?: number }) =>
    apiRequest<{ task: any }>(`/workspaces/${workspaceId}/tasks/${taskId}/move`, {
      method: "PATCH",
      token,
      body: JSON.stringify(data),
    }),

  assign: (token: string, workspaceId: string, taskId: string, assigneeId: string | null) =>
    apiRequest<{ task: any }>(`/workspaces/${workspaceId}/tasks/${taskId}/assign`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ assigneeId }),
    }),

  delete: (token: string, workspaceId: string, taskId: string) =>
    apiRequest(`/workspaces/${workspaceId}/tasks/${taskId}`, {
      method: "DELETE",
      token,
    }),

  search: (token: string, workspaceId: string, params: Record<string, any>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        qs.append(k, String(v));
      }
    });
    return apiRequest<{ tasks: any[]; pagination: any; appliedFilters: any }>(
      `/workspaces/${workspaceId}/tasks/search?${qs.toString()}`,
      {
        method: "GET",
        token,
      }
    );
  },
};
