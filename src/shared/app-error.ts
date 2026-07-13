import { domainCodeForMessage } from "./error-codes.js";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 400, code?: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code ?? domainCodeForMessage(message) ?? AppError.defaultCodeForStatus(statusCode);
    this.details = details;
  }

  private static defaultCodeForStatus(statusCode: number) {
    const codes: Record<number, string> = {
      400: "BAD_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      422: "UNPROCESSABLE_ENTITY",
      429: "TOO_MANY_REQUESTS",
      502: "BAD_GATEWAY",
      503: "SERVICE_UNAVAILABLE",
    };

    return codes[statusCode] ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");
  }
}
