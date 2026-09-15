import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/modules/system-settings/system-settings.service.js", () => ({ systemSettingsService: {} }));
import { fetchPortalJson } from "../src/modules/financial-execution/portal-transparencia.client.js";
afterEach(() => vi.unstubAllGlobals());
describe("Portal list pagination transport", () => {
  it("accepts a real HTTP 200 empty array when listing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
    await expect(fetchPortalJson("https://example.test", "test", "missing", { allowEmptyArray: true })).resolves.toEqual([]);
  });
  it("preserves the not-found semantics of individual lookups", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
    await expect(fetchPortalJson("https://example.test", "test", "missing")).rejects.toThrow("missing");
  });
  it.each([404, 429, 500])("does not treat HTTP %s as a completed page", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status })));
    await expect(fetchPortalJson("https://example.test", "test", "missing", { allowEmptyArray: true })).rejects.toThrow();
  });
  it("does not accept an empty body as a valid list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    await expect(fetchPortalJson("https://example.test", "test", "missing", { allowEmptyArray: true })).rejects.toThrow();
  });
});
