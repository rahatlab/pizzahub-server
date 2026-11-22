import type { RequestHandler } from "express"
import { ApiError } from "../utils/ApiError"
import type { Role } from "../config/constants"
import type { AuthUser } from "../types/domain"

/** 403 FORBIDDEN unless the loaded DB role is in the allow list. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized())
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden())
    next()
  }
}

/**
 * Explicit ownership check (plan §12): resource ids are compared against the
 * DB-loaded user, never against anything the client sent.
 */
export function assertOwner(
  resourceOwnerId: unknown,
  user: AuthUser,
  message = "You do not have access to this resource."
): void {
  if (String(resourceOwnerId) !== user.id) {
    throw ApiError.forbidden(message)
  }
}
