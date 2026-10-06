import { describe, expect, it } from "vitest";
import { decryptPortalApiToken, decryptSecret, encryptPortalApiToken, encryptSecret } from "../src/shared/secret-envelope.js";

describe("proteção do token do Portal da Transparência", () => {
  it("criptografa com nonce aleatório e recupera o valor original", () => {
    const first = encryptPortalApiToken("token-secreto-de-teste");
    const second = encryptPortalApiToken("token-secreto-de-teste");
    expect(first).not.toBe(second);
    expect(first).not.toContain("token-secreto-de-teste");
    expect(decryptPortalApiToken(first)).toBe("token-secreto-de-teste");
  });

  it("rejeita alteração do conteúdo autenticado", () => {
    const envelope = encryptPortalApiToken("token-secreto-de-teste");
    expect(() => decryptPortalApiToken(`${envelope}x`)).toThrow("não pôde ser descriptografado");
  });
});

describe("proteção de outros segredos do SAGEP", () => {
  it("isola o segredo pela finalidade", () => {
    const envelope = encryptSecret("senha-smtp", "notification-smtp-password");
    expect(decryptSecret(envelope, "notification-smtp-password")).toBe("senha-smtp");
    expect(() => decryptSecret(envelope, "notification-telegram-bot-token")).toThrow("não pôde ser descriptografado");
  });
});
