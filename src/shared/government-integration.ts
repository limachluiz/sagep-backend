import { createHash } from "node:crypto";

import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { notificationsService } from "../modules/notifications/notifications.service.js";

export type GovernmentProvider =
  "PORTAL_TRANSPARENCIA" | "COMPRAS_GOV" | "PNCP";

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter))
    return Math.min(Number(retryAfter) * 1000, 10_000);
  return Math.min(250 * 2 ** attempt + Math.floor(Math.random() * 150), 5_000);
}

export async function reportGovernmentIntegrationFailure(
  provider: GovernmentProvider,
  message: string,
  status: number | null,
  details: Record<string, unknown>,
) {
  try {
    await prisma.integrationConnectionCheck.create({
      data: {
        provider,
        status: status === 429 ? "DEGRADED" : "UNAVAILABLE",
        httpStatus: status,
        message,
        details: details as Prisma.InputJsonValue,
      },
    });
    const recipients = await prisma.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "GESTOR"] } },
      select: { id: true },
    });
    const bucket = new Date().toISOString().slice(0, 13);
    await notificationsService.publish({
      eventKey: `INTEGRATION_FAILURE:${provider}:${bucket}`,
      recipientIds: recipients.map((item) => item.id),
      category: "INTEGRATION",
      severity: "CRITICAL",
      title: `Integração ${provider} requer atenção`,
      description: message,
      detailsPath: "/settings/integrations",
      entityType: "INTEGRATION",
      entityId: provider,
      metadata: details as Prisma.InputJsonValue,
      preference: "integrations",
    });
  } catch (error) {
    console.error("Falha ao registrar indisponibilidade de integração", {
      provider,
      error,
    });
  }
}

export async function resilientGovernmentFetch(
  provider: GovernmentProvider,
  url: URL | string,
  init: RequestInit,
  timeoutMs: number,
  attempts = 3,
) {
  let lastError: unknown;
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastResponse = response;
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts)
      await sleep(
        process.env.NODE_ENV === "test" ? 0 : retryDelay(lastResponse, attempt),
      );
  }
  const status = lastResponse?.status ?? null;
  const message = `${provider} falhou após ${attempts} tentativa(s)${status ? ` (HTTP ${status})` : " por timeout ou rede"}`;
  await reportGovernmentIntegrationFailure(provider, message, status, {
    endpoint: String(url),
    attempts,
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  });
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error(message);
}

export function responseFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assertObjectPayload(
  value: unknown,
  provider: GovernmentProvider,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${provider} alterou o formato esperado da resposta`);
}
