import { describe, expect, it, vi } from "vitest";
import { requireTrustedBrowserOrigin } from "../src/middlewares/csrf.middleware.js";
import { requireStepUp } from "../src/middlewares/step-up.middleware.js";
import { generateAccessToken, generateStepUpToken } from "../src/shared/auth-tokens.js";

function request(headers: Record<string, string>, userId = "user-1") {
  return {
    user: { id: userId },
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as any;
}

describe("security middlewares", () => {
  it("rejeita operação de origem cruzada", () => {
    const next = vi.fn();
    requireTrustedBrowserOrigin(
      request({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
      {} as any,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CSRF_ORIGIN_DENIED", statusCode: 403 }),
    );
  });

  it("aceita a origem configurada do frontend", () => {
    const next = vi.fn();
    requireTrustedBrowserOrigin(
      request({ origin: "http://localhost:5173", "sec-fetch-site": "same-site" }),
      {} as any,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("considera login recente uma autenticação reforçada", () => {
    const accessToken = generateAccessToken(
      { email: "admin@sagep.test", role: "ADMIN", authenticationMethod: "PASSWORD" },
      "user-1",
    );
    const next = vi.fn();
    requireStepUp(
      request({ authorization: `Bearer ${accessToken}` }),
      {} as any,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("não considera renovação silenciosa como confirmação de senha", () => {
    const accessToken = generateAccessToken(
      { email: "admin@sagep.test", role: "ADMIN", authenticationMethod: "REFRESH" },
      "user-1",
    );
    const next = vi.fn();
    requireStepUp(
      request({ authorization: `Bearer ${accessToken}` }),
      {} as any,
      next,
    );
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AUTH_STEP_UP_REQUIRED", statusCode: 428 }),
    );
  });

  it("aceita somente token reforçado vinculado ao usuário autenticado", () => {
    const token = generateStepUpToken("user-1");
    const accepted = vi.fn();
    requireStepUp(request({ "x-sagep-reauth": token }), {} as any, accepted);
    expect(accepted).toHaveBeenCalledWith();

    const rejected = vi.fn();
    requireStepUp(request({ "x-sagep-reauth": token }, "user-2"), {} as any, rejected);
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AUTH_STEP_UP_INVALID_OR_EXPIRED", statusCode: 428 }),
    );
  });
});
