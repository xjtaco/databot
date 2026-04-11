declare namespace Express {
  interface Request {
    user?: {
      userId: string;
      username: string;
      role: string;
      mustChangePassword: boolean;
    };
    auditContext?: {
      action: string;
      category: string;
      params: Record<string, unknown>;
    };
  }
}
