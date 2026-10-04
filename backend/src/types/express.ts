import { WorkspaceMember } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      workspaceMember?: WorkspaceMember;
      workspaceId?: string;
    }
  }
}

export {};
