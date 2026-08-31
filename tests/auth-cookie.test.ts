import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";

import { setRefreshTokenCookie } from "../src/shared/auth-cookie.js";

describe("refresh token cookie", () => {
  it("usa cookie de sessão por padrão", () => {
    const cookie = vi.fn();
    const response = { cookie } as unknown as Response;

    setRefreshTokenCookie(response, "refresh-token");

    expect(cookie).toHaveBeenCalledWith(
      expect.any(String),
      "refresh-token",
      expect.not.objectContaining({ expires: expect.any(Date) }),
    );
  });

  it("define expiração somente quando o usuário solicita persistência", () => {
    const cookie = vi.fn();
    const response = { cookie } as unknown as Response;

    setRefreshTokenCookie(response, "refresh-token", true);

    expect(cookie).toHaveBeenCalledWith(
      expect.any(String),
      "refresh-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        expires: expect.any(Date),
      }),
    );
  });
});
