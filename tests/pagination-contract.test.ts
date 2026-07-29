import { describe, expect, it } from "vitest";
import { buildListResponse } from "../src/shared/pagination.js";

describe("contrato de paginacao", () => {
  it("pagina, limpa filtros internos e preserva o link da requisicao", () => {
    const response = buildListResponse({
      items: [{ id: 1 }, { id: 2 }, { id: 3 }],
      pagination: { page: 2, pageSize: 2, format: "envelope" },
      filters: {
        page: 2,
        pageSize: 2,
        format: "envelope",
        search: "manaus",
        empty: "",
        omitted: undefined,
      },
      path: "/api/projects?page=2&pageSize=2&search=manaus",
    });

    expect(response).toEqual({
      items: [{ id: 3 }],
      meta: {
        page: 2,
        pageSize: 2,
        totalItems: 3,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
      filters: { search: "manaus" },
      links: { self: "/api/projects?page=2&pageSize=2&search=manaus" },
    });
  });

  it("mantem uma primeira pagina vazia com metadados previsiveis", () => {
    const response = buildListResponse({
      items: [],
      pagination: { page: 3, pageSize: 50, format: "envelope" },
      path: "/api/projects?page=3",
    });

    expect(response.items).toEqual([]);
    expect(response.meta).toEqual({
      page: 1,
      pageSize: 50,
      totalItems: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });
});
