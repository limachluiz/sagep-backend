import { describe, expect, it } from "vitest";
import { emailListSchema, notificationAutomationSchema, smtpSettingsSchema, telegramSettingsSchema } from "../src/modules/notification-settings/notification-settings.schemas.js";
import { commitmentNumber, scheduleReached, telegramDigest, zonedScheduleParts } from "../src/modules/notification-settings/notification-automation.service.js";

describe("configuração dos canais de notificação", () => {
  it("aceita SMTP autenticado e normaliza o remetente", () => {
    const result = smtpSettingsSchema.parse({ enabled: true, host: "smtp.interno", port: "587", secure: false, username: "sagep", password: "segredo", fromName: "SAGEP", fromEmail: "ALERTAS@EXEMPLO.MIL.BR" });
    expect(result.port).toBe(587);
    expect(result.fromEmail).toBe("alertas@exemplo.mil.br");
  });

  it("rejeita token Telegram fora do formato oficial", () => {
    expect(telegramSettingsSchema.safeParse({ enabled: true, botToken: "token-invalido", chatId: "-100123" }).success).toBe(false);
    expect(telegramSettingsSchema.safeParse({ enabled: true, botToken: "123456:ABC_def-ghi", chatId: "-100123" }).success).toBe(true);
  });

  it("rejeita destinatário repetido na mesma lista", () => {
    const result = emailListSchema.safeParse({ name: "Gestores", active: true, roles: ["GESTOR"], recipients: [{ email: "gestor@exemplo.mil.br" }, { email: "GESTOR@EXEMPLO.MIL.BR" }] });
    expect(result.success).toBe(false);
  });

  it("valida e normaliza a rotina automática", () => {
    const result = notificationAutomationSchema.parse({ enabled: true, timeZone: "America/Manaus", hour: "7", minute: 30, weekdays: [5, 1, 1], syncTrackedCommitments: true, discoverCommitments: true, syncAtaBalances: true, managementUnits: ["160016", "167016", "160016"], emailEnabled: true, telegramEnabled: false, emailListIds: [], notifyRoles: ["GESTOR"], maxDiscoveryPages: 100 });
    expect(result.weekdays).toEqual([1, 5]);
    expect(result.managementUnits).toEqual(["160016", "167016"]);
    expect(notificationAutomationSchema.safeParse({ ...result, managementUnits: ["16016"] }).success).toBe(false);
  });

  it("calcula o horário no fuso configurado", () => {
    expect(zonedScheduleParts(new Date("2026-10-06T11:30:00Z"), "America/Manaus")).toEqual({ date: "2026-10-06", hour: 7, minute: 30, weekday: 2 });
  });

  it("recupera uma execução agendada mesmo depois do minuto exato", () => {
    expect(scheduleReached({ hour: 11, minute: 59 }, 12, 0)).toBe(false);
    expect(scheduleReached({ hour: 12, minute: 0 }, 12, 0)).toBe(true);
    expect(scheduleReached({ hour: 12, minute: 5 }, 12, 0)).toBe(true);
  });

  it("formata o número completo e agrupa alertas do Telegram com acesso oficial", () => {
    const externalCode = "160016000012026NE000022";
    expect(commitmentNumber(externalCode)).toBe("2026NE000022");
    const result = telegramDigest([
      { type: "NE_PAID", title: "NE 2026NE000022 paga", description: "Empresa & Cia · R$ 100,00", payload: { externalCode } },
      { type: "NE_DISCOVERED", title: "Nova NE 2026NE000023", description: "Outra empresa", payload: { externalCode: "160016000012026NE000023" } },
    ]);
    expect(result.text).toContain("✅ NEs pagas");
    expect(result.text).toContain("🆕 Novas NEs encontradas");
    expect(result.text).toContain("Empresa &amp; Cia");
    expect(result.buttons[0]).toEqual({ text: "🔎 2026NE000022", url: `https://portaldatransparencia.gov.br/despesas/documento/empenho/${externalCode}` });
  });
});
