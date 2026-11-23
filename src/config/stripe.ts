import Stripe from "stripe"
import { env } from "./env.js"

/**
 * Module-scope Stripe client (plan §6.2: cache at module scope so cold
 * starts pay the construction cost once). The placeholder key keeps the
 * constructor safe when payments are unconfigured; routes gate on
 * `paymentsConfigured` and answer with PAYMENT_ERROR instead.
 *
 * Options: SDK timeout/retries are set explicitly (plan §6.3) so no
 * handler ever blocks past the 10s Vercel budget.
 */
export const stripe = new Stripe(
  env.STRIPE_SECRET_KEY || "sk_test_not_configured",
  {
    timeout: 8_000,
    maxNetworkRetries: 2,
  }
)

export const paymentsConfigured = Boolean(
  env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
)

/** Premium pricing (plan §14): $99.99 one-time, lifetime access — inline on the Checkout Session. */
export const PREMIUM_PRICE_CENTS = 9999
export const PREMIUM_CURRENCY = "usd"
