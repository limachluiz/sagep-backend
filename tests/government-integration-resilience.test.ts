import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/prisma.js", () => ({ prisma: { integrationConnectionCheck: { create: vi.fn() }, user: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("../src/modules/notifications/notifications.service.js", () => ({ notificationsService: { publish: vi.fn() } }));

import { resilientGovernmentFetch, responseFingerprint } from "../src/shared/government-integration.js";

describe("resiliência das integrações governamentais", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("repete 429 e conclui quando a fonte se recupera", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("limite", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await resilientGovernmentFetch("PNCP", "https://example.test", {}, 100, 3);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gera impressão estável para detectar páginas repetidas", () => {
    expect(responseFingerprint([{ id: 1 }])).toBe(responseFingerprint([{ id: 1 }]));
    expect(responseFingerprint([{ id: 1 }])).not.toBe(responseFingerprint([{ id: 2 }]));
  });
});
