declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      permissions?: string[];
      rank?: string | null;
      cpf?: string | null;
    };
  }
}
