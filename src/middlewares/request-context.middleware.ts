import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "X-Request-Id";

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const candidate = req.header(REQUEST_ID_HEADER)?.trim();
  const requestId = candidate && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(candidate) ? candidate : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
