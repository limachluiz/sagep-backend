declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      rank?: string | null;
      cpf?: string | null;
    };
  }
}