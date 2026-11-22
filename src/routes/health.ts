import { Router } from "express"
import { dbState } from "../config/db"
import { ApiResponse } from "../utils/ApiResponse"

export const healthRouter = Router()

/**
 * Public liveness probe (plan §9.2). Reports DB state without requiring it —
 * Vercel health checks must pass even during a Mongo outage.
 */
healthRouter.get("/", (_req, res) => {
  res
    .status(200)
    .json(
      ApiResponse.success("Service is healthy.", {
        status: "ok",
        db: dbState() === 1 ? "connected" : "disconnected",
        uptime: Math.round(process.uptime()),
      })
    )
})
