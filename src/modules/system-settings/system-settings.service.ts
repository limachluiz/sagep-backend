import { performance } from "node:perf_hooks";
import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { auditService } from "../audit/audit.service.js";
import type { IntegrationProviderInput, UpdateSystemSettingsInput } from "./system-settings.schemas.js";

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
};

type CurrentUser = { id: string; name?: string; email: string };
type ConnectionStatus = "OPERATIONAL" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED";

function tokenSummary() {
  const token = env.PORTAL_TRANSPARENCIA_API_TOKEN?.trim();
  return {
    configured: Boolean(token),
    masked: token ? `••••••••${token.slice(-4)}` : null,
    source: "ENVIRONMENT" as const,
  };
}

function publicConfiguration<T extends Record<string, unknown>>(settings: T) {
  return { ...settings, portalApiToken: tokenSummary() };
}

export class SystemSettingsService {
  async getEffective() {
    const stored = await prisma.systemConfiguration.findUnique({ where: { id: "default" } });
    return stored ? { ...DEFAULTS, ...stored } : { ...DEFAULTS, updatedById: null, createdAt: null, updatedAt: null };
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

  async update(input: UpdateSystemSettingsInput, user: CurrentUser) {
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
    return Object.fromEntries(Object.entries(settings).filter(([key]) => !["updatedById", "createdAt", "updatedAt"].includes(key))) as Record<string, string | number | boolean | null>;
  }

  private async probeDatabase() {
    const started = performance.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return this.result("OPERATIONAL", started, null, "PostgreSQL conectado e respondendo", { target: "DATABASE_URL" });
    } catch (error) {
      return this.result("UNAVAILABLE", started, null, "Não foi possível consultar o PostgreSQL", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async probePortal() {
    const settings = await this.getEffective();
    const token = env.PORTAL_TRANSPARENCIA_API_TOKEN?.trim();
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
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
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
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  private result(status: ConnectionStatus, started: number, httpStatus: number | null, message: string, details: Record<string, unknown>) {
    return { status, latencyMs: Math.round(performance.now() - started), httpStatus, message, details };
  }
}

export const systemSettingsService = new SystemSettingsService();
