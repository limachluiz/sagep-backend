import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import type { InitializeSetupInput } from "./setup.schemas.js";
import { getSetupToken, removeGeneratedSetupToken, setupTokenWasGenerated } from "./setup-token.js";

function tokenDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function assertSetupToken(candidate: string) {
  const configured = getSetupToken();
  if (!configured) {
    throw new AppError(
      "A chave de instalação não foi configurada no servidor",
      503,
      "SETUP_TOKEN_NOT_CONFIGURED",
    );
  }

  if (!timingSafeEqual(tokenDigest(candidate), tokenDigest(configured))) {
    throw new AppError("Chave de instalação inválida", 401, "SETUP_TOKEN_INVALID");
  }
}

function nullable(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

export class SetupService {
  async status() {
    const userCount = await prisma.user.count();
    return {
      requiresSetup: userCount === 0,
      setupTokenConfigured: Boolean(getSetupToken()),
      setupTokenGenerated: setupTokenWasGenerated(),
    };
  }

  async initialize(input: InitializeSetupInput, context: { ipAddress?: string; userAgent?: string }) {
    assertSetupToken(input.setupToken);
    const passwordHash = await bcrypt.hash(input.administrator.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(731947221)`;

      if (await tx.user.count()) {
        throw new AppError(
          "A instalação do SAGEP já foi inicializada",
          409,
          "SETUP_ALREADY_COMPLETED",
        );
      }

      const administrator = await tx.user.create({
        data: {
          name: input.administrator.name,
          email: input.administrator.email,
          passwordHash,
          role: "ADMIN",
          active: true,
        },
        select: { id: true, userCode: true, name: true, email: true, role: true },
      });

      const configuration = await tx.systemConfiguration.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          organizationName: input.organization.name,
          organizationAcronym: input.organization.acronym,
          uasg: input.organization.uasg,
          management: input.organization.management,
          timeZone: input.organization.timeZone,
          commandName: input.organization.commandName,
          deploymentHostName: nullable(input.network.hostName),
          deploymentExpectedIp: nullable(input.network.expectedIp),
          deploymentGateway: nullable(input.network.gateway),
          deploymentDnsServers: input.network.dnsServers,
          deploymentNtpServers: input.network.ntpServers,
          deploymentAllowedNetworks: input.network.allowedNetworks,
          deploymentProxyUrl: nullable(input.network.proxyUrl),
          deploymentCertificateMode: "INTERNAL_CA",
          updatedById: administrator.id,
        },
        update: {
          organizationName: input.organization.name,
          organizationAcronym: input.organization.acronym,
          uasg: input.organization.uasg,
          management: input.organization.management,
          timeZone: input.organization.timeZone,
          commandName: input.organization.commandName,
          deploymentHostName: nullable(input.network.hostName),
          deploymentExpectedIp: nullable(input.network.expectedIp),
          deploymentGateway: nullable(input.network.gateway),
          deploymentDnsServers: input.network.dnsServers,
          deploymentNtpServers: input.network.ntpServers,
          deploymentAllowedNetworks: input.network.allowedNetworks,
          deploymentProxyUrl: nullable(input.network.proxyUrl),
          deploymentCertificateMode: "INTERNAL_CA",
          updatedById: administrator.id,
        },
      });

      await tx.militaryOrganization.upsert({
        where: { sigla: input.organization.acronym },
        create: {
          sigla: input.organization.acronym,
          name: input.organization.name,
          cityName: input.organization.cityName,
          stateUf: input.organization.stateUf,
        },
        update: {
          name: input.organization.name,
          cityName: input.organization.cityName,
          stateUf: input.organization.stateUf,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: "SYSTEM_SETTINGS",
          entityId: "default",
          action: "CREATE",
          actorUserId: administrator.id,
          actorName: administrator.name,
          summary: "Instalação inicial segura do SAGEP concluída",
          metadata: {
            organizationAcronym: input.organization.acronym,
            hostName: nullable(input.network.hostName),
            ipAddress: context.ipAddress ?? null,
            userAgent: context.userAgent ?? null,
          },
        },
      });

      return {
        initialized: true,
        administrator,
        organization: {
          name: configuration.organizationName,
          acronym: configuration.organizationAcronym,
        },
      };
    }, { isolationLevel: "Serializable" });
    try {
      await removeGeneratedSetupToken();
    } catch (error) {
      console.error("Administrador criado, mas o arquivo da chave temporária não pôde ser removido imediatamente", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    return result;
  }
}
