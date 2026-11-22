import type { RequestHandler } from "express"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { env } from "../config/env"
import { connectDb } from "../config/db"
import { User } from "../models/User"
import { ApiError } from "../utils/ApiError"
import { syncUserSubscription } from "../utils/subscription"
import type { AuthUser } from "../types/domain"
import type { Role } from "../config/constants"

// Cached at module scope for Vercel cold starts (plan §6.2): the JWKS is
// fetched at most once per cache window, not per request.
const jwks = createRemoteJWKSet(
  new URL(`${env.BETTER_AUTH_URL}/api/auth/jwks`),
  {
    cooldownDuration: 30_000,
    cacheMaxAge: 3_600_000,
  }
)

/**
 * Verifies the Better Auth JWT (signature via remote JWKS, issuer +
 * audience), then loads the user from Mongo so role/isBlocked/plan always
 * come from the DB — never from the token (plan §5.3, §12).
 */
export const verifyJWT: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization
    if (!header?.startsWith("Bearer ")) {
      throw ApiError.unauthorized()
    }

    const token = header.slice("Bearer ".length).trim()
    if (!token) throw ApiError.unauthorized()

    let sub: string
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: env.BETTER_AUTH_URL,
        audience: env.BETTER_AUTH_URL,
      })
      if (!payload.sub) throw ApiError.unauthorized()
      sub = payload.sub
    } catch (error) {
      if (error instanceof ApiError) throw error
      const expired =
        error instanceof Error &&
        (error as { code?: string }).code === "ERR_JWT_EXPIRED"
      throw new ApiError(
        401,
        expired
          ? "Your session expired. Please sign in again."
          : "Invalid authentication token.",
        "INVALID_TOKEN"
      )
    }

    await connectDb()
    const user = await User.findById(sub).lean()

    if (!user) {
      throw ApiError.unauthorized("Account no longer exists.")
    }
    if (user.isBlocked) {
      throw new ApiError(403, "Account blocked.", "ACCOUNT_BLOCKED")
    }

    // Downgrade expired premium vendors even if the Stripe webhook was missed.
    await syncUserSubscription(user)

    req.user = {
      id: String(user._id),
      name: user.name ?? "",
      email: user.email ?? "",
      image: user.image ?? null,
      role: (user.role ?? "customer") as Role,
      isBlocked: Boolean(user.isBlocked),
      businessName: user.businessName ?? null,
      subscriptionPlan:
        user.subscriptionPlan === "premium" ? "premium" : "free",
      subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
      subscriptionCancelAtPeriodEnd: Boolean(
        user.subscriptionCancelAtPeriodEnd
      ),
      stripeCustomerId: user.stripeCustomerId ?? null,
    } satisfies AuthUser

    next()
  } catch (error) {
    next(error)
  }
}
