import { performance } from "node:perf_hooks";
import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { auditService } from "../audit/audit.service.js";
import type { IntegrationProviderInput, PortalApiTokenInput, UpdateSystemSettingsInput } from "./system-settings.schemas.js";
import { assertAllowedIntegrationUrl } from "../../shared/integration-url.js";
import { decryptPortalApiToken, encryptPortalApiToken, secretEncryptionSource } from "../../shared/secret-envelope.js";

const DEFAULTS = {
  id: "default",
  organizationName: "4º Centro de Telemática de Área",
  organizationAcronym: "4º CTA",
  uasg: "160016",
  management: "00001",
  timeZone: "America/Manaus",
  commandName: "COMANDO MILITAR DA AMAZÔNIA",
  portalTransparenciaBaseUrl: env.PORTAL_TRANSPARENCIA_BASE_URL,
  portalSyncIntervalMinutes: env.PORTAL_TRANSPARENCIA_SYNC_INTERVAL_MINUTES,
  portalSyncOnStartup: true,
  comprasGovBaseUrl: "https://dadosabertos.compras.gov.br",
  pncpBaseUrl: "https://pncp.gov.br/api/pncp",
  defaultBiddingNumber: null as string | null,
  defaultBiddingYear: null as number | null,
  defaultImmediateCommitment: true,
  defaultEstimateGroup: "3",
  portalApiTokenEncrypted: null as string | null,
  portalApiTokenUpdatedAt: null as Date | null,
  portalApiTokenUpdatedById: null as string | null,
};

type CurrentUser = { id: string; name?: string; email: string };
type ConnectionStatus = "OPERATIONAL" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED";

function tokenSummary(settings: { portalApiTokenEncrypted?: string | null; portalApiTokenUpdatedAt?: Date | null }) {
  const stored = Boolean(settings.portalApiTokenEncrypted);
  const environment = Boolean(env.PORTAL_TRANSPARENCIA_API_TOKEN?.trim());
  return {
    configured: stored || environment,
    source: stored ? "DATABASE" as const : environment ? "ENVIRONMENT" as const : null,
    updatedAt: stored ? settings.portalApiTokenUpdatedAt ?? null : null,
    encryption: stored ? secretEncryptionSource() : null,
  };
}

function publicConfiguration<T extends Record<string, unknown>>(settings: T) {
  const { portalApiTokenEncrypted: _encrypted, portalApiTokenUpdatedById: _updatedBy, ...safe } = settings;
  return { ...safe, portalApiToken: tokenSummary(settings) };
}

export class SystemSettingsService {
  async getEffective() {
    const stored = await prisma.systemConfiguration.findUnique({ where: { id: "default" } });
    const settings = stored ? { ...DEFAULTS, ...stored } : { ...DEFAULTS, updatedById: null, createdAt: null, updatedAt: null };
    assertAllowedIntegrationUrl(settings.portalTransparenciaBaseUrl, "PORTAL_TRANSPARENCIA");
    assertAllowedIntegrationUrl(settings.comprasGovBaseUrl, "COMPRAS_GOV");
    assertAllowedIntegrationUrl(settings.pncpBaseUrl, "PNCP");
    return settings;
  }

  async get() {
    const settings = await this.getEffective();
    const latestChecks = await Promise.all(
      (["DATABASE", "PORTAL_TRANSPARENCIA", "COMPRAS_GOV", "PNCP"] as const).map((provider) =>
        prisma.integrationConnectionCheck.findFirst({ where: { provider }, orderBy: { checkedAt: "desc" } }),
      ),
    );
    return publicConfiguration({
      ...settings,
      connections: Object.fromEntries(latestChecks.filter(Boolean).map((check) => [check!.provider, check])),
    });
  }

  async getPortalApiToken() {
    const settings = await this.getEffective();
    if (settings.portalApiTokenEncrypted) {
      return decryptPortalApiToken(settings.portalApiTokenEncrypted);
    }
    return env.PORTAL_TRANSPARENCIA_API_TOKEN?.trim() || null;
  }

  async savePortalApiToken(input: PortalApiTokenInput, user: CurrentUser) {
    const encrypted = encryptPortalApiToken(input.token);
    const updatedAt = new Date();
    const before = tokenSummary(await this.getEffective());
    await prisma.systemConfiguration.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        portalApiTokenEncrypted: encrypted,
        portalApiTokenUpdatedAt: updatedAt,
        portalApiTokenUpdatedById: user.id,
      },
      update: {
        portalApiTokenEncrypted: encrypted,
        portalApiTokenUpdatedAt: updatedAt,
        portalApiTokenUpdatedById: user.id,
      },
    });
    await auditService.log({
      entityType: "SYSTEM_SETTINGS",
      entityId: "PORTAL_TRANSPARENCIA_API_TOKEN",
      action: "UPDATE",
      actor: { id: user.id, name: user.name ?? user.email },
      summary: before.configured ? "Token do Portal da Transparência substituído" : "Token do Portal da Transparência configurado",
      before: { configured: before.configured, source: before.source },
      after: { configured: true, source: "DATABASE" },
      metadata: { secretValueLogged: false },
    });
    return { portalApiToken: tokenSummary(await this.getEffective()) };
  }

  async removePortalApiToken(user: CurrentUser) {
    const before = tokenSummary(await this.getEffective());
    await prisma.systemConfiguration.updateMany({
      where: { id: "default" },
      data: {
        portalApiTokenEncrypted: null,
        portalApiTokenUpdatedAt: null,
        portalApiTokenUpdatedById: null,
      },
    });
    const after = tokenSummary(await this.getEffective());
    await auditService.log({
      entityType: "SYSTEM_SETTINGS",
      entityId: "PORTAL_TRANSPARENCIA_API_TOKEN",
      action: "DELETE",
      actor: { id: user.id, name: user.name ?? user.email },
      summary: "Token armazenado do Portal da Transparência removido",
      before: { configured: before.configured, source: before.source },
      after: { configured: after.configured, source: after.source },
      metadata: { environmentFallbackActive: after.source === "ENVIRONMENT", secretValueLogged: false },
    });
    return { portalApiToken: after };
  }

  async update(input: UpdateSystemSettingsInput, user: CurrentUser) {
    assertAllowedIntegrationUrl(input.portalTransparenciaBaseUrl, "PORTAL_TRANSPARENCIA");
    assertAllowedIntegrationUrl(input.comprasGovBaseUrl, "COMPRAS_GOV");
    if (input.pncpBaseUrl) assertAllowedIntegrationUrl(input.pncpBaseUrl, "PNCP");
    const before = await this.getEffective();
    const data = {
      ...input,
      defaultBiddingNumber: input.defaultBiddingNumber || null,
      defaultBiddingYear: input.defaultBiddingYear ?? null,
      updatedById: user.id,
    };
    const updated = await prisma.systemConfiguration.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
    await auditService.log({
      entityType: "SYSTEM_SETTINGS",
      entityId: "default",
      action: "UPDATE",
      actor: { id: user.id, name: user.name ?? user.email },
      summary: "Parâmetros institucionais e integrações atualizados",
      before: this.auditSnapshot(before),
      after: this.auditSnapshot(updated),
    });
    return this.get();
  }

  async testAll(user: CurrentUser) {
    const results = [];
    for (const provider of ["DATABASE", "PORTAL_TRANSPARENCIA", "COMPRAS_GOV", "PNCP"] as const) {
      results.push(await this.testConnection(provider, user));
    }
    return { checkedAt: new Date(), results };
  }

  async testConnection(provider: IntegrationProviderInput, user: CurrentUser) {
    const result = provider === "DATABASE"
      ? await this.probeDatabase()
      : provider === "PORTAL_TRANSPARENCIA"
        ? await this.probePortal()
        : provider === "COMPRAS_GOV"
          ? await this.probeComprasGov()
          : await this.probePncp();
    const saved = await prisma.integrationConnectionCheck.create({
      data: {
        provider,
        status: result.status,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
        message: result.message,
        details: result.details as Prisma.InputJsonValue,
        checkedById: user.id,
      },
    });
    await auditService.log({
      entityType: "SYSTEM_SETTINGS",
      entityId: provider,
      action: "CONNECTION_TEST",
      actor: { id: user.id, name: user.name ?? user.email },
      summary: `Teste da integração ${provider}: ${result.status}`,
      metadata: { provider, status: result.status, latencyMs: result.latencyMs, httpStatus: result.httpStatus },
    });
    return saved;
  }

  private auditSnapshot(settings: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(settings).filter(([key]) => ![
      "updatedById",
      "createdAt",
      "updatedAt",
      "portalApiTokenEncrypted",
      "portalApiTokenUpdatedById",
    ].includes(key))) as Record<string, string | number | boolean | null>;
  }

  private async probeDatabase() {
    const started = performance.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return this.result("OPERATIONAL", started, null, "PostgreSQL conectado e respondendo", { target: "DATABASE_URL" });
    } catch {
      return this.result(
        "UNAVAILABLE",
        started,
        null,
        "Não foi possível consultar o PostgreSQL",
        { target: "DATABASE_URL" },
      );
    }
  }

  private async probePortal() {
    const settings = await this.getEffective();
    const token = await this.getPortalApiToken();
    if (!token) return this.result("NOT_CONFIGURED", performance.now(), null, "Token do Portal da Transparência não configurado", { tokenSource: "PORTAL_TRANSPARENCIA_API_TOKEN" });
    const url = new URL(`${settings.portalTransparenciaBaseUrl.replace(/\/$/, "")}/orgaos-siafi`);
    url.searchParams.set("pagina", "1");
    return this.probeHttp(url, { "chave-api-dados": token, Accept: "application/json" }, "Portal da Transparência");
  }

  private async probeComprasGov() {
    const settings = await this.getEffective();
    const url = new URL("/modulo-arp/1_consultarARP", settings.comprasGovBaseUrl);
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 364);
    url.searchParams.set("pagina", "1");
    url.searchParams.set("tamanhoPagina", "10");
    url.searchParams.set("codigoUnidadeGerenciadora", settings.uasg);
    url.searchParams.set("dataVigenciaInicialMin", startDate.toISOString().slice(0, 10));
    url.searchParams.set("dataVigenciaInicialMax", endDate.toISOString().slice(0, 10));
    return this.probeHttp(url, { Accept: "application/json" }, "Compras.gov.br");
  }

  private async probePncp() {
    const settings = await this.getEffective();
    // Valida exatamente o serviço configurado para consultar atas. O PNCP costuma
    // responder em mais de 15 segundos, por isso usa o timeout próprio da integração.
    const baseUrl = settings.pncpBaseUrl.replace(/\/$/, "");
    const url = new URL(`${baseUrl}/v3/api-docs`);
    const result = await this.probeHttp(
      url,
      { Accept: "application/json" },
      "PNCP",
      env.PNCP_REQUEST_TIMEOUT_MS,
    );
    return {
      ...result,
      details: { ...result.details, configuredBaseUrl: settings.pncpBaseUrl },
    };
  }

  private async probeHttp(
    url: URL,
    headers: Record<string, string>,
    label: string,
    timeoutMs = env.INTEGRATION_PROBE_TIMEOUT_MS,
  ) {
    const started = performance.now();
    try {
      const response = await fetch(url, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const status: ConnectionStatus = response.ok ? "OPERATIONAL" : response.status === 429 ? "DEGRADED" : "UNAVAILABLE";
      const message = response.ok ? `${label} respondeu com sucesso` : response.status === 429 ? `${label} acessível, mas com limite de requisições` : `${label} respondeu com HTTP ${response.status}`;
      return this.result(status, started, response.status, message, { endpoint: `${url.origin}${url.pathname}` });
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError";
      return this.result(
        "UNAVAILABLE",
        started,
        null,
        timeout ? `${label} excedeu ${Math.round(timeoutMs / 1000)} segundos` : `${label} não respondeu`,
        {
          endpoint: `${url.origin}${url.pathname}`,
          timeoutMs,
        },
      );
    }
  }

  private result(status: ConnectionStatus, started: number, httpStatus: number | null, message: string, details: Record<string, unknown>) {
    return { status, latencyMs: Math.round(performance.now() - started), httpStatus, message, details };
  }
}

export const systemSettingsService = new SystemSettingsService();
