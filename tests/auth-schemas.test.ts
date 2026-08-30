import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "../src/modules/auth/auth.schemas.js";
import { createUserByAdminSchema } from "../src/modules/users/users.schemas.js";

describe("auth input hardening", () => {
  it("normaliza o e-mail antes da autenticação", () => {
    expect(loginSchema.parse({ email: "  ADMIN@SAGEP.COM ", password: "123456" }).email)
      .toBe("admin@sagep.com");
  });

  it("limita o custo de senhas recebidas no login", () => {
    expect(() => loginSchema.parse({
      email: "admin@sagep.com",
      password: "x".repeat(129),
    })).toThrow();
  });

  it.each([
    [registerSchema, { name: "Usuário Teste", email: "teste@sagep.com", password: "1234567" }],
    [createUserByAdminSchema, {
      name: "Usuário Teste",
      email: "teste@sagep.com",
      password: "1234567",
      role: "CONSULTA",
    }],
  ])("exige oito caracteres em novas credenciais", (schema, payload) => {
    expect(() => schema.parse(payload)).toThrow();
  });
});
