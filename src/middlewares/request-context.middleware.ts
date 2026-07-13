import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "X-Request-Id";

export function requestContextMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();

  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
