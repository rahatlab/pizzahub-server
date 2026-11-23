import type { Request, RequestHandler } from "express"
import { ZodError, type ZodType } from "zod"
import { ApiError } from "../utils/ApiError.js"
import type { RequestValidation } from "../types/domain.js"

type Schemas = {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

/**
 * Zod-validates request parts (PROJECT_PLAN §12). Results land on
 * `req.validated` because Express 5 `req.query` is a read-only getter.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const result: RequestValidation = {}

    try {
      if (schemas.body) result.body = schemas.body.parse(req.body ?? {})
      if (schemas.query) result.query = schemas.query.parse(req.query ?? {})
      if (schemas.params) result.params = schemas.params.parse(req.params ?? {})
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.map(String).join(".") || "body",
          issue: issue.message,
        }))
        return next(ApiError.validation(details))
      }
      return next(error)
    }

    req.validated = result
    next()
  }
}

export function validatedBody<T>(req: Request): T {
  return req.validated?.body as T
}

export function validatedQuery<T>(req: Request): T {
  return req.validated?.query as T
}

export function validatedParams<T>(req: Request): T {
  return req.validated?.params as T
}
