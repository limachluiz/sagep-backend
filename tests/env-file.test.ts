import { describe, expect, it } from "vitest";
import { parseEnvironmentFile, quoteEnvironmentValue } from "../scripts/env-file.mjs";

describe("arquivo de ambiente independente de dependências", () => {
  it("lê comentários, export, aspas e valores simples", () => {
    expect(parseEnvironmentFile([
      "# configuração",
      "export NODE_ENV=production",
      'DATABASE_URL="postgresql://sagep:abc@postgres:5432/sagep?schema=public"',
      "EMPTY=",
      "LABEL=valor # comentário",
      "LITERAL='texto sem expansão'",
    ].join("\n"))).toEqual({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://sagep:abc@postgres:5432/sagep?schema=public",
      EMPTY: "",
      LABEL: "valor",
      LITERAL: "texto sem expansão",
    });
  });

  it("rejeita linhas malformadas e aspas abertas", () => {
    expect(() => parseEnvironmentFile("CHAVE")) .toThrow(/Linha 1/);
    expect(() => parseEnvironmentFile('CHAVE="aberta')).toThrow(/Aspas/);
  });

  it("protege valores que exigem aspas", () => {
    expect(quoteEnvironmentValue("production")).toBe("production");
    expect(quoteEnvironmentValue("texto com espaço")).toBe('"texto com espaço"');
    expect(quoteEnvironmentValue('a"b')).toBe('"a\\"b"');
  });
});
