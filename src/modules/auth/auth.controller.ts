import { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import {
  authUserIdParamSchema,
  cleanupSessionsSchema,
  listSessionsQuerySchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  sessionIdParamSchema,
} from "./auth.schemas.js";
import { buildListResponse } from "../../shared/pagination.js";

const authService = new AuthService();

function getRequestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  };
}

export class AuthController {
  async register(req: Request, res: Response) {
    const data = registerSchema.parse(req.body);
    const user = await authService.register(data);

    return res.status(201).json(user);
  }

  async login(req: Request, res: Response) {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data, getRequestContext(req));

    return res.status(200).json(result);
  }

  async me(req: Request, res: Response) {
    const userId = req.user!.id;
    const user = await authService.me(userId);

    return res.status(200).json(user);
  }

  async refresh(req: Request, res: Response) {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const tokens = await authService.refresh(refreshToken, getRequestContext(req));

    return res.status(200).json(tokens);
  }

  async logout(req: Request, res: Response) {
    const { refreshToken } = logoutSchema.parse(req.body);
    const result = await authService.logout(refreshToken, getRequestContext(req));
    return res.status(200).json(result);
  }

  async listOwnSessions(req: Request, res: Response) {
    const query = listSessionsQuerySchema.parse(req.query);
    const sessions = await authService.listOwnSessions(req.user!, query, getRequestContext(req));
    if (query.format === "legacy") {
      return res.status(200).json(sessions);
    }

    const envelope = buildListResponse({
      items: sessions.sessions,
      pagination: query,
      filters: query,
      path: req.originalUrl,
    });

    return res.status(200).json({
      ...sessions,
      filters: envelope.filters,
      sessions: envelope.items,
      meta: envelope.meta,
      links: envelope.links,
    });
  }

  async revokeOwnSession(req: Request, res: Response) {
    const { sessionId } = sessionIdParamSchema.parse(req.params);
    const result = await authService.revokeOwnSession(sessionId, req.user!, getRequestContext(req));

    return res.status(200).json(result);
  }

  async revokeAllOwnSessions(req: Request, res: Response) {
    const result = await authService.revokeAllOwnSessions(req.user!, getRequestContext(req));

    return res.status(200).json(result);
  }

  async listUserSessions(req: Request, res: Response) {
    const { userId } = authUserIdParamSchema.parse(req.params);
    const query = listSessionsQuerySchema.parse(req.query);
    const sessions = await authService.listUserSessions(
      userId,
      req.user!,
      query,
      getRequestContext(req),
    );
    if (query.format === "legacy") {
      return res.status(200).json(sessions);
    }

    const envelope = buildListResponse({
      items: sessions.sessions,
      pagination: query,
      filters: query,
      path: req.originalUrl,
    });

    return res.status(200).json({
      ...sessions,
      filters: envelope.filters,
      sessions: envelope.items,
      meta: envelope.meta,
      links: envelope.links,
    });
  }

  async revokeUserSession(req: Request, res: Response) {
    const { userId, sessionId } = {
      ...authUserIdParamSchema.parse(req.params),
      ...sessionIdParamSchema.parse(req.params),
    };
    const result = await authService.revokeUserSession(
      userId,
      sessionId,
      req.user!,
      getRequestContext(req),
    );

    return res.status(200).json(result);
  }

  async revokeAllUserSessions(req: Request, res: Response) {
    const { userId } = authUserIdParamSchema.parse(req.params);
    const result = await authService.revokeAllUserSessions(
      userId,
      req.user!,
      getRequestContext(req),
    );

    return res.status(200).json(result);
  }

  async cleanupSessions(req: Request, res: Response) {
    const data = cleanupSessionsSchema.parse(req.body ?? {});
    const result = await authService.cleanupSessions(data, req.user!, getRequestContext(req));

    return res.status(200).json(result);
  }
}
