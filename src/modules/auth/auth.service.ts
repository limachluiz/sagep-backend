import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { permissionsService } from "../permissions/permissions.service.js";
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpirationDate,
  hashToken,
  verifyRefreshToken,
} from "../../shared/auth-tokens.js";

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthRequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type CurrentUser = {
  id: string;
  name?: string | null;
  email: string;
  role: string;
  permissions?: string[];
};

type SessionStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

type ListSessionsInput = {
  status: SessionStatus | "ALL";
};

type CleanupSessionsInput = {
  refreshTokenRetentionDays: number;
  auditRetentionDays: number;
};

type SessionTargetUser = {
  id: string;
  userCode: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
};

type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  createdIpAddress: string | null;
  createdUserAgent: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: "LOGOUT" | "ROTATED" | "EXPIRED" | "ADMIN_REVOKED" | "SECURITY" | null;
  revokedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SerializedSession = {
  id: string;
  userId: string;
  status: SessionStatus;
  statusDetail: {
    code: SessionStatus;
    label: string;
    reason: string | null;
    reasonLabel: string | null;
  };
  currentSession: boolean;
  expiresAt: Date;
  createdIpAddress: string | null;
  createdUserAgent: string | null;
  lastUsedAt: Date | null;
  lastActivityAt: Date;
  revokedAt: Date | null;
  revokedReason: SessionRecord["revokedReason"];
  revokedByUserId: string | null;
  securityContext: {
    ipAddress: string | null;
    userAgent: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
};

export class AuthService {
  private getSessionStatus(token: Pick<SessionRecord, "expiresAt" | "revokedAt">, now = new Date()) {
    if (token.revokedAt) {
      return "REVOKED" as const;
    }

    if (token.expiresAt < now) {
      return "EXPIRED" as const;
    }

    return "ACTIVE" as const;
  }

  private getSessionStatusDetail(status: SessionStatus, revokedReason: SessionRecord["revokedReason"]) {
    const reasonLabels: Record<NonNullable<SessionRecord["revokedReason"]>, string> = {
      LOGOUT: "Logout do usuario",
      ROTATED: "Token renovado",
      EXPIRED: "Expiracao registrada",
      ADMIN_REVOKED: "Revogacao administrativa",
      SECURITY: "Revogacao por seguranca",
    };

    const labels: Record<SessionStatus, string> = {
      ACTIVE: "Ativa",
      REVOKED: "Revogada",
      EXPIRED: "Expirada",
    };

    return {
      code: status,
      label: labels[status],
      reason: revokedReason,
      reasonLabel: revokedReason ? reasonLabels[revokedReason] : null,
    };
  }

  private serializeSession(token: SessionRecord, now = new Date()): SerializedSession {
    const status = this.getSessionStatus(token, now);

    return {
      id: token.id,
      userId: token.userId,
      status,
      statusDetail: this.getSessionStatusDetail(status, token.revokedReason),
      currentSession: false,
      expiresAt: token.expiresAt,
      createdIpAddress: token.createdIpAddress,
      createdUserAgent: token.createdUserAgent,
      lastUsedAt: token.lastUsedAt,
      lastActivityAt: token.lastUsedAt ?? token.createdAt,
      revokedAt: token.revokedAt,
      revokedReason: token.revokedReason,
      revokedByUserId: token.revokedByUserId,
      securityContext: {
        ipAddress: token.createdIpAddress,
        userAgent: token.createdUserAgent,
      },
      createdAt: token.createdAt,
      updatedAt: token.updatedAt,
    };
  }

  private resolveCurrentSession(
    sessions: SerializedSession[],
    scope: "OWN" | "ADMIN",
    context?: AuthRequestContext,
  ) {
    if (scope !== "OWN") {
      return {
        currentSessionId: null as string | null,
        currentSessionDetected: false,
        currentSessionConfidence: "UNAVAILABLE" as const,
      };
    }

    const activeSessions = sessions
      .filter((session) => session.status === "ACTIVE")
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

    if (activeSessions.length === 0) {
      return {
        currentSessionId: null as string | null,
        currentSessionDetected: false,
        currentSessionConfidence: "UNAVAILABLE" as const,
      };
    }

    const userAgentMatch = context?.userAgent
      ? activeSessions.find((session) => session.createdUserAgent === context.userAgent)
      : null;

    if (userAgentMatch) {
      return {
        currentSessionId: userAgentMatch.id,
        currentSessionDetected: true,
        currentSessionConfidence: "USER_AGENT" as const,
      };
    }

    return {
      currentSessionId: activeSessions[0].id,
      currentSessionDetected: true,
      currentSessionConfidence: "LATEST_ACTIVE" as const,
    };
  }

  private buildSessionGovernance(scope: "OWN" | "ADMIN") {
    return {
      scope,
      canListOwn: true,
      canRevokeOwn: true,
      canListAll: scope === "ADMIN",
      canRevokeAll: scope === "ADMIN",
      canCleanup: scope === "ADMIN",
      retentionManagedBy: "sessions.manage_all",
    };
  }

  private assertOwnSessionPermission(user: CurrentUser) {
    if (!permissionsService.hasPermission(user, "sessions.manage_own")) {
      throw new AppError("Você não tem permissão para gerenciar suas sessões", 403);
    }
  }

  private assertAdminSessionPermission(user: CurrentUser) {
    if (!permissionsService.hasPermission(user, "sessions.manage_all")) {
      throw new AppError("Você não tem permissão para administrar sessões de outros usuários", 403);
    }
  }

  private async getSessionTargetUser(userId: string): Promise<SessionTargetUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userCode: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    return user;
  }

  private async markSessionAsExpired(
    storedToken: {
      id: string;
      userId: string;
      expiresAt: Date;
      revokedAt: Date | null;
      user: { id: string; name: string | null; email: string };
    },
    context?: AuthRequestContext,
  ) {
    if (storedToken.revokedAt) {
      return;
    }

    const revokedAt = new Date();

    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        revokedAt,
        revokedReason: "EXPIRED",
        revokedByUserId: null,
      },
    });

    await auditService.log({
      entityType: "AUTH",
      entityId: storedToken.userId,
      action: "SESSION_EXPIRE",
      actor: {
        id: storedToken.user.id,
        name: storedToken.user.name,
      },
      summary: `Sessão expirada para ${storedToken.user.email}`,
      metadata: {
        refreshTokenId: storedToken.id,
        expiresAt: storedToken.expiresAt,
        markedExpiredAt: revokedAt,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      },
    });
  }

  private async listSessionsForUser(
    targetUser: SessionTargetUser,
    filters: ListSessionsInput,
    permissionUsed: "sessions.manage_own" | "sessions.manage_all",
    scope: "OWN" | "ADMIN",
    context?: AuthRequestContext,
  ) {
    const now = new Date();
    const tokens = await prisma.refreshToken.findMany({
      where: {
        userId: targetUser.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const serializedSessions = tokens.map((token) => this.serializeSession(token, now));
    const currentSession = this.resolveCurrentSession(serializedSessions, scope, context);
    const sessionsWithCurrent = serializedSessions.map((session) => ({
      ...session,
      currentSession: session.id === currentSession.currentSessionId,
    }));
    const summary = serializedSessions.reduce(
      (acc, session) => {
        acc.total += 1;
        acc[session.status.toLowerCase() as "active" | "revoked" | "expired"] += 1;
        return acc;
      },
      {
        total: 0,
        active: 0,
        revoked: 0,
        expired: 0,
        byStatus: {
          ACTIVE: 0,
          REVOKED: 0,
          EXPIRED: 0,
        },
        generatedAt: now,
        ...currentSession,
      },
    );
    summary.byStatus.ACTIVE = summary.active;
    summary.byStatus.REVOKED = summary.revoked;
    summary.byStatus.EXPIRED = summary.expired;

    const sessions =
      filters.status === "ALL"
        ? sessionsWithCurrent
        : sessionsWithCurrent.filter((session) => session.status === filters.status);

    return {
      scope,
      permissionUsed,
      user: targetUser,
      filters,
      summary,
      governance: this.buildSessionGovernance(scope),
      sessions,
    };
  }

  private async logFailedLogin(
    email: string,
    reason: "USER_NOT_FOUND" | "INVALID_PASSWORD" | "USER_INACTIVE",
    context?: AuthRequestContext,
    user?: { id: string; name: string | null },
  ) {
    await auditService.log({
      entityType: "AUTH",
      entityId: user?.id ?? "LOGIN_FAILED",
      action: "LOGIN_FAILED",
      actor: user
        ? {
            id: user.id,
            name: user.name,
          }
        : undefined,
      summary: `Falha de login para ${email}`,
      metadata: {
        email,
        reason,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      },
    });
  }

  async register(data: RegisterInput) {
    const userExists = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (userExists) {
      throw new AppError("J\u00e1 existe um usu\u00e1rio com este e-mail", 409);
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: "CONSULTA",
      },
      select: {
        id: true,
        userCode: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(data: LoginInput, context?: AuthRequestContext) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      await this.logFailedLogin(data.email, "USER_NOT_FOUND", context);
      throw new AppError("E-mail ou senha inv\u00e1lidos", 401);
    }

    const passwordMatches = await bcrypt.compare(data.password, user.passwordHash);

    if (!passwordMatches) {
      await this.logFailedLogin(data.email, "INVALID_PASSWORD", context, user);
      throw new AppError("E-mail ou senha inv\u00e1lidos", 401);
    }

    if (!user.active) {
      await this.logFailedLogin(data.email, "USER_INACTIVE", context, user);
      throw new AppError("Usu\u00e1rio inativo", 403);
    }

    const accessToken = generateAccessToken(
      {
        email: user.email,
        role: user.role,
      },
      user.id,
    );

    const refreshToken = generateRefreshToken(
      {
        email: user.email,
        role: user.role,
      },
      user.id,
    );

    const loginAt = new Date();
    const storedRefreshToken = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: loginAt },
      });

      return tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: getRefreshTokenExpirationDate(),
          createdIpAddress: context?.ipAddress,
          createdUserAgent: context?.userAgent,
        },
      });
    });

    const effectivePermissions = await permissionsService.getEffectivePermissionsForUser(
      user.id,
      user.role,
    );

    await auditService.log({
      entityType: "AUTH",
      entityId: user.id,
      action: "LOGIN",
      actor: {
        id: user.id,
        name: user.name,
      },
      summary: `Login realizado por ${user.email}`,
      metadata: {
        email: user.email,
        role: user.role,
        refreshTokenId: storedRefreshToken.id,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        userCode: user.userCode,
        name: user.name,
        email: user.email,
        role: user.role,
        rank: user.rank,
        cpf: user.cpf,
        active: user.active,
        createdAt: user.createdAt,
        permissions: effectivePermissions,
        access: {
          role: user.role,
          permissions: effectivePermissions,
          isAdmin: user.role === "ADMIN",
        },
      },
    };
  }

  async refresh(refreshToken: string, context?: AuthRequestContext) {
    verifyRefreshToken(refreshToken);

    const tokenHash = hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!storedToken) {
      throw new AppError("Refresh token inv\u00e1lido", 401);
    }

    if (storedToken.revokedAt) {
      throw new AppError("Refresh token revogado", 401);
    }

    if (storedToken.expiresAt < new Date()) {
      await this.markSessionAsExpired(storedToken, context);
      throw new AppError("Refresh token expirado", 401);
    }

    if (!storedToken.user.active) {
      throw new AppError("Usu\u00e1rio inativo", 401);
    }

    const newAccessToken = generateAccessToken(
      {
        email: storedToken.user.email,
        role: storedToken.user.role,
      },
      storedToken.user.id,
    );

    const newRefreshToken = generateRefreshToken(
      {
        email: storedToken.user.email,
        role: storedToken.user.role,
      },
      storedToken.user.id,
    );

    const now = new Date();
    const newStoredRefreshToken = await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          lastUsedAt: now,
          revokedAt: now,
          revokedReason: "ROTATED",
          revokedByUserId: null,
        },
      });

      return tx.refreshToken.create({
        data: {
          userId: storedToken.user.id,
          tokenHash: hashToken(newRefreshToken),
          expiresAt: getRefreshTokenExpirationDate(),
          createdIpAddress: context?.ipAddress,
          createdUserAgent: context?.userAgent,
        },
      });
    });

    await auditService.log({
      entityType: "AUTH",
      entityId: storedToken.user.id,
      action: "TOKEN_REFRESH",
      actor: {
        id: storedToken.user.id,
        name: storedToken.user.name,
      },
      summary: `Refresh token renovado para ${storedToken.user.email}`,
      metadata: {
        email: storedToken.user.email,
        oldRefreshTokenId: storedToken.id,
        newRefreshTokenId: newStoredRefreshToken.id,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string, context?: AuthRequestContext) {
    const tokenHash = hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!storedToken) {
      return { message: "Logout realizado com sucesso" };
    }

    const alreadyRevoked = Boolean(storedToken.revokedAt);
    const revokedReason = storedToken.revokedReason ?? "LOGOUT";

    if (!alreadyRevoked) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          revokedAt: new Date(),
          revokedReason: "LOGOUT",
          revokedByUserId: storedToken.userId,
        },
      });
    }

    await auditService.log({
      entityType: "AUTH",
      entityId: storedToken.userId,
      action: "LOGOUT",
      actor: {
        id: storedToken.user?.id,
        name: storedToken.user?.name,
      },
      summary: `Logout realizado${storedToken.user?.email ? ` por ${storedToken.user.email}` : ""}`,
      metadata: {
        refreshTokenId: storedToken.id,
        revokedReason,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
        alreadyRevoked,
      },
    });

    return { message: "Logout realizado com sucesso" };
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userCode: true,
        name: true,
        email: true,
        role: true,
        rank: true,
        cpf: true,
        active: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError("Usu\u00e1rio n\u00e3o encontrado", 404);
    }

    const effectivePermissions = await permissionsService.getEffectivePermissionsForUser(
      user.id,
      user.role,
    );

    return {
      ...user,
      permissions: effectivePermissions,
      access: {
        role: user.role,
        permissions: effectivePermissions,
        isAdmin: user.role === "ADMIN",
      },
    };
  }

  async listOwnSessions(user: CurrentUser, filters: ListSessionsInput, context?: AuthRequestContext) {
    this.assertOwnSessionPermission(user);

    const targetUser = await this.getSessionTargetUser(user.id);

    return this.listSessionsForUser(targetUser, filters, "sessions.manage_own", "OWN", context);
  }

  async listUserSessions(
    userId: string,
    currentUser: CurrentUser,
    filters: ListSessionsInput,
    context?: AuthRequestContext,
  ) {
    this.assertAdminSessionPermission(currentUser);

    const targetUser = await this.getSessionTargetUser(userId);

    return this.listSessionsForUser(
      targetUser,
      filters,
      "sessions.manage_all",
      "ADMIN",
      context,
    );
  }

  async revokeOwnSession(
    sessionId: string,
    currentUser: CurrentUser,
    context?: AuthRequestContext,
  ) {
    this.assertOwnSessionPermission(currentUser);

    return this.revokeSession({
      sessionId,
      targetUserId: currentUser.id,
      actor: currentUser,
      revokedReason: "SECURITY",
      permissionUsed: "sessions.manage_own",
      scope: "OWN",
      context,
    });
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
    currentUser: CurrentUser,
    context?: AuthRequestContext,
  ) {
    this.assertAdminSessionPermission(currentUser);

    return this.revokeSession({
      sessionId,
      targetUserId: userId,
      actor: currentUser,
      revokedReason: "ADMIN_REVOKED",
      permissionUsed: "sessions.manage_all",
      scope: "ADMIN",
      context,
    });
  }

  async revokeAllOwnSessions(currentUser: CurrentUser, context?: AuthRequestContext) {
    this.assertOwnSessionPermission(currentUser);

    return this.revokeAllSessions({
      targetUserId: currentUser.id,
      actor: currentUser,
      revokedReason: "SECURITY",
      permissionUsed: "sessions.manage_own",
      scope: "OWN",
      context,
    });
  }

  async revokeAllUserSessions(
    userId: string,
    currentUser: CurrentUser,
    context?: AuthRequestContext,
  ) {
    this.assertAdminSessionPermission(currentUser);

    return this.revokeAllSessions({
      targetUserId: userId,
      actor: currentUser,
      revokedReason: "ADMIN_REVOKED",
      permissionUsed: "sessions.manage_all",
      scope: "ADMIN",
      context,
    });
  }

  async cleanupSessions(
    data: CleanupSessionsInput,
    currentUser: CurrentUser,
    context?: AuthRequestContext,
  ) {
    this.assertAdminSessionPermission(currentUser);

    const now = new Date();
    const refreshTokenCutoff = new Date(now.getTime() - data.refreshTokenRetentionDays * 86400000);
    const auditCutoff = new Date(now.getTime() - data.auditRetentionDays * 86400000);

    const [deletedRefreshTokens, deletedAuditLogs] = await prisma.$transaction([
      prisma.refreshToken.deleteMany({
        where: {
          OR: [
            {
              revokedAt: {
                lte: refreshTokenCutoff,
              },
            },
            {
              expiresAt: {
                lte: refreshTokenCutoff,
              },
            },
          ],
        },
      }),
      prisma.auditLog.deleteMany({
        where: {
          entityType: "AUTH",
          createdAt: {
            lte: auditCutoff,
          },
        },
      }),
    ]);

    await auditService.log({
      entityType: "AUTH",
      entityId: currentUser.id,
      action: "SESSION_CLEANUP",
      actor: {
        id: currentUser.id,
        name: currentUser.name,
      },
      summary: `Limpeza administrativa de sessões executada por ${currentUser.email}`,
      metadata: {
        refreshTokenRetentionDays: data.refreshTokenRetentionDays,
        auditRetentionDays: data.auditRetentionDays,
        refreshTokenCutoff,
        auditCutoff,
        deletedRefreshTokens: deletedRefreshTokens.count,
        deletedAuditLogs: deletedAuditLogs.count,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      },
    });

    return {
      message: "Limpeza de sessões executada com sucesso",
      permissionUsed: "sessions.manage_all",
      scope: "ADMIN",
      governance: this.buildSessionGovernance("ADMIN"),
      retention: {
        refreshTokenRetentionDays: data.refreshTokenRetentionDays,
        auditRetentionDays: data.auditRetentionDays,
        refreshTokenCutoff,
        auditCutoff,
      },
      retentionPolicy: {
        refreshTokens: {
          retentionDays: data.refreshTokenRetentionDays,
          cutoff: refreshTokenCutoff,
          removesRevokedBeforeCutoff: true,
          removesExpiredBeforeCutoff: true,
        },
        auditLogs: {
          retentionDays: data.auditRetentionDays,
          cutoff: auditCutoff,
          entityType: "AUTH",
        },
      },
      deleted: {
        refreshTokens: deletedRefreshTokens.count,
        auditLogs: deletedAuditLogs.count,
      },
      summary: {
        deletedRefreshTokens: deletedRefreshTokens.count,
        deletedAuditLogs: deletedAuditLogs.count,
        executedAt: now,
      },
    };
  }

  private async revokeSession(input: {
    sessionId: string;
    targetUserId: string;
    actor: CurrentUser;
    revokedReason: "SECURITY" | "ADMIN_REVOKED";
    permissionUsed: "sessions.manage_own" | "sessions.manage_all";
    scope: "OWN" | "ADMIN";
    context?: AuthRequestContext;
  }) {
    const targetUser = await this.getSessionTargetUser(input.targetUserId);
    const token = await prisma.refreshToken.findUnique({
      where: {
        id: input.sessionId,
      },
    });

    if (!token || token.userId !== targetUser.id) {
      throw new AppError("Sessão não encontrada", 404);
    }

    const now = new Date();
    const currentStatus = this.getSessionStatus(token, now);
    const alreadyInactive = currentStatus !== "ACTIVE";

    const updatedToken = alreadyInactive
      ? token
      : await prisma.refreshToken.update({
          where: { id: token.id },
          data: {
            revokedAt: now,
            revokedReason: input.revokedReason,
            revokedByUserId: input.actor.id,
          },
        });

    await auditService.log({
      entityType: "AUTH",
      entityId: targetUser.id,
      action: "SESSION_REVOKE",
      actor: {
        id: input.actor.id,
        name: input.actor.name,
      },
      summary:
        input.scope === "OWN"
          ? `Sessão revogada pelo próprio usuário ${targetUser.email}`
          : `Sessão de ${targetUser.email} revogada administrativamente`,
      metadata: {
        scope: input.scope,
        refreshTokenId: token.id,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        previousStatus: currentStatus,
        resultingStatus: this.getSessionStatus(updatedToken, now),
        alreadyInactive,
        revokedReason: alreadyInactive ? token.revokedReason : input.revokedReason,
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });

    return {
      message: alreadyInactive
        ? "Sessão já estava inativa"
        : "Sessão revogada com sucesso",
      permissionUsed: input.permissionUsed,
      scope: input.scope,
      alreadyInactive,
      user: targetUser,
      session: this.serializeSession(updatedToken, now),
    };
  }

  private async revokeAllSessions(input: {
    targetUserId: string;
    actor: CurrentUser;
    revokedReason: "SECURITY" | "ADMIN_REVOKED";
    permissionUsed: "sessions.manage_own" | "sessions.manage_all";
    scope: "OWN" | "ADMIN";
    context?: AuthRequestContext;
  }) {
    const targetUser = await this.getSessionTargetUser(input.targetUserId);
    const now = new Date();
    const activeSessions = await prisma.refreshToken.findMany({
      where: {
        userId: targetUser.id,
        revokedAt: null,
        expiresAt: {
          gte: now,
        },
      },
      select: {
        id: true,
      },
    });

    if (activeSessions.length > 0) {
      await prisma.refreshToken.updateMany({
        where: {
          id: {
            in: activeSessions.map((session) => session.id),
          },
        },
        data: {
          revokedAt: now,
          revokedReason: input.revokedReason,
          revokedByUserId: input.actor.id,
        },
      });
    }

    await auditService.log({
      entityType: "AUTH",
      entityId: targetUser.id,
      action: "SESSION_REVOKE_ALL",
      actor: {
        id: input.actor.id,
        name: input.actor.name,
      },
      summary:
        input.scope === "OWN"
          ? `Todas as sessões ativas de ${targetUser.email} foram revogadas pelo próprio usuário`
          : `Todas as sessões ativas de ${targetUser.email} foram revogadas administrativamente`,
      metadata: {
        scope: input.scope,
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        revokedReason: input.revokedReason,
        revokedCount: activeSessions.length,
        activeSessionIds: activeSessions.map((session) => session.id),
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });

    return {
      message:
        activeSessions.length > 0
          ? "Sessões ativas revogadas com sucesso"
          : "Nenhuma sessão ativa encontrada para revogação",
      permissionUsed: input.permissionUsed,
      scope: input.scope,
      user: targetUser,
      revokedCount: activeSessions.length,
    };
  }
}
