import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  format: z.enum(["envelope", "legacy"]).default("envelope"),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

type ListResponseInput<T> = {
  items: T[];
  pagination: PaginationQuery;
  filters?: Record<string, unknown>;
  path: string;
};

function cleanFilters(filters: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([key, value]) =>
        !["page", "pageSize", "format"].includes(key) &&
        value !== undefined &&
        value !== "",
    ),
  );
}

export function buildListResponse<T>({ items, pagination, filters, path }: ListResponseInput<T>) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pagination.pageSize));
  const page = Math.min(pagination.page, totalPages);
  const start = (page - 1) * pagination.pageSize;
  const paginatedItems = items.slice(start, start + pagination.pageSize);

  return {
    items: paginatedItems,
    meta: {
      page,
      pageSize: pagination.pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    filters: cleanFilters(filters),
    links: {
      self: path,
    },
  };
}
