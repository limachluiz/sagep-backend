import { describe, expect, it } from "vitest";
import { updateOwnProfileSchema } from "../src/modules/auth/auth.schemas.js";
import { createUserByAdminSchema, updateUserSchema } from "../src/modules/users/users.schemas.js";
import { MILITARY_RANKS } from "../src/shared/military-ranks.js";

describe("postos e graduações militares", () => {
  it("mantém a relação na ordem usada pelos formulários", () => {
    expect(MILITARY_RANKS).toEqual([
      "Sd",
      "Cb",
      "3º Sgt",
      "2º Sgt",
      "1º Sgt",
      "St",
      "Asp",
      "2º Ten",
      "1º Ten",
      "Cap",
      "Maj",
      "TC",
      "Cel",
    ]);
  });

  it("aceita somente valores pré-selecionados no cadastro administrativo", () => {
    const baseUser = {
      name: "Luiz Lima",
      email: "luiz@sagep.mil.br",
      password: "12345678",
      role: "PROJETISTA" as const,
    };

    expect(createUserByAdminSchema.safeParse({ ...baseUser, rank: "Cap" }).success).toBe(true);
    expect(createUserByAdminSchema.safeParse({ ...baseUser, rank: "General" }).success).toBe(false);
  });

  it("permite selecionar ou remover o valor nas edições autorizadas", () => {
    expect(updateUserSchema.safeParse({ rank: "3º Sgt" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ rank: null }).success).toBe(true);
    expect(updateOwnProfileSchema.safeParse({ rank: "Cel" }).success).toBe(true);
    expect(updateOwnProfileSchema.safeParse({ rank: null }).success).toBe(true);
    expect(updateOwnProfileSchema.safeParse({ rank: "Outro" }).success).toBe(false);
  });
});
