import { MAX_PAGE_SIZE, MENU_PAGE_SIZE } from "../config/constants.js"
import type { PaginationMeta } from "../types/domain.js"

export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = MENU_PAGE_SIZE
): { page: number; limit: number; skip: number } {
  const rawPage = Number(query.page)
  const rawLimit = Number(query.limit)

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(MAX_PAGE_SIZE, Math.floor(rawLimit))
      : defaultLimit

  return { page, limit, skip: (page - 1) * limit }
}

export function buildPagination(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
  }
}

export function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
