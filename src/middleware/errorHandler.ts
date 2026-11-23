import type { ErrorRequestHandler, RequestHandler } from "express"
import { ZodError } from "zod"
import { MulterError } from "multer"
import { ApiError, type ApiErrorDetail } from "../utils/ApiError.js"
import { isProduction } from "../config/env.js"

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new ApiError(404, `Route ${req.method} ${req.originalUrl} not found.`, "NOT_FOUND")
  )
}

function zodDetails(error: ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join(".") || "body",
    issue: issue.message,
  }))
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
  )
}

function isCastError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { name?: unknown }).name === "CastError"
  )
}

/** express.json()/urlencoded() rejections carry a `type` like `entity.parse.failed`. */
function isBodyParserError(error: unknown): error is { type: string } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "type" in error &&
      typeof (error as { type?: unknown }).type === "string" &&
      (error as { type: string }).type.startsWith("entity.")
  )
}

function isMongooseValidationError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { name?: unknown }).name === "ValidationError" &&
      "errors" in error
  )
}

/**
 * Express 5 error boundary: maps thrown errors to the standard error
 * envelope from PROJECT_PLAN §9.1. Never leaks stack traces in production;
 * logs method/path/status only (§6.2).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let apiError: ApiError
  let original: Error | null = null

  if (err instanceof ApiError) {
    apiError = err
  } else if (err instanceof ZodError) {
    apiError = ApiError.validation(zodDetails(err))
  } else if (err instanceof MulterError) {
    apiError =
      err.code === "LIMIT_FILE_SIZE"
        ? new ApiError(413, "Image must be 3MB or smaller.", "UPLOAD_FAILED")
        : new ApiError(400, err.message, "UPLOAD_FAILED")
  } else if (isBodyParserError(err)) {
    // Malformed JSON or oversized body from express.json().
    apiError =
      err.type === "entity.too.large"
        ? new ApiError(413, "Request body is too large.", "VALIDATION_ERROR")
        : ApiError.validation(
            [{ field: "body", issue: "Invalid JSON in request body." }],
            "Invalid request body."
          )
  } else if (isCastError(err)) {
    // Invalid ObjectId → the resource does not exist (plan: invalid id → 404).
    apiError = new ApiError(404, "Resource not found.", "NOT_FOUND")
  } else if (isDuplicateKey(err)) {
    apiError = new ApiError(409, "That value already exists.", "CONFLICT")
  } else if (isMongooseValidationError(err)) {
    const details = Object.entries(
      (err as { errors: Record<string, { message: string }> }).errors
    ).map(([field, issue]) => ({ field, issue: issue.message }))
    apiError = ApiError.validation(details, "Validation failed.")
  } else {
    original = err instanceof Error ? err : new Error(String(err))
    apiError = new ApiError(
      500,
      "Something went wrong on our end.",
      "INTERNAL_ERROR"
    )
  }

  if (apiError.statusCode >= 500) {
    // Log method/path/status only; full stack only outside production (§6.2).
    if (isProduction || !original) {
      console.error(
        `[error] ${req.method} ${req.originalUrl} → ${apiError.statusCode} ${apiError.code}`
      )
    } else {
      console.error(
        `[error] ${req.method} ${req.originalUrl} → ${apiError.statusCode}`,
        original.message,
        original.stack
      )
    }
  }

  res.status(apiError.statusCode).json({
    success: false,
    message: apiError.message,
    error: {
      code: apiError.code,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
    meta: { timestamp: new Date().toISOString() },
  })
}
