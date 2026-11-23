import { rateLimit } from "express-rate-limit"
import type { NextFunction, Request, Response } from "express"
import { ApiError } from "../utils/ApiError.js"

const FIFTEEN_MINUTES = 15 * 60 * 1000

function reject(_req: Request, _res: Response, next: NextFunction) {
  next(
    new ApiError(
      429,
      "Too many requests. Please wait a moment and try again.",
      "RATE_LIMITED"
    )
  )
}

// Best-effort per instance on Vercel (plan §6.2).
export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: reject,
})

// Stricter for image uploads.
export const uploadLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: reject,
})
