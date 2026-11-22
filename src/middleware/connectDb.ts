import type { RequestHandler } from "express"
import { connectDb } from "../config/db"
import { ApiError } from "../utils/ApiError"

/**
 * Opens the Mongo connection before DB-backed routes run. With
 * `bufferCommands: false` a failed connect surfaces here as a clean 500
 * instead of hanging the request until Vercel times out.
 */
export const connectDbMiddleware: RequestHandler = async (_req, _res, next) => {
  try {
    await connectDb()
    next()
  } catch (error) {
    console.error("[db] connection failed:", (error as Error).message)
    next(new ApiError(500, "Database unavailable.", "INTERNAL_ERROR"))
  }
}
