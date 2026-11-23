import { Router } from "express"
import type { RequestHandler } from "express"
import type Stripe from "stripe"
import { env } from "../config/env.js"
import {
  stripe,
  paymentsConfigured,
  PREMIUM_CURRENCY,
  PREMIUM_PRICE_CENTS,
} from "../config/stripe.js"
import { connectDb } from "../config/db.js"
import { User } from "../models/User.js"
import { Transaction } from "../models/Transaction.js"
import { verifyJWT } from "../middleware/verifyJWT.js"
import { requireRole } from "../middleware/requireRole.js"
import { validate, validatedQuery } from "../middleware/validate.js"
import { transactionListQuery } from "../validators/schemas.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { serializeTransaction } from "../utils/serialize.js"
import { buildPagination, parsePagination } from "../utils/pagination.js"
import { isPremiumActive } from "../utils/subscription.js"

export const paymentRouter = Router()

type SubscriptionState = {
  plan: "free" | "premium"
  premiumActive: boolean
  priceCents: number
  currency: string
}

/**
 * Lifetime premium (plan §5.5): one payment, never renews — so there is
 * no expiry date and no cancel flag in the response.
 */
function subscriptionState(user: {
  subscriptionPlan?: string
  subscriptionExpiresAt?: unknown
}): SubscriptionState {
  return {
    plan: user.subscriptionPlan === "premium" ? "premium" : "free",
    premiumActive: isPremiumActive(user),
    priceCents: PREMIUM_PRICE_CENTS,
    currency: PREMIUM_CURRENCY,
  }
}

function requirePayments(): void {
  if (!paymentsConfigured) {
    throw new ApiError(500, "Payments are not configured.", "PAYMENT_ERROR")
  }
}

// ── Vendor: Checkout ────────────────────────────────────────────────────

/**
 * Vendor id comes from the JWT only — a body-supplied vendor id is never
 * read (plan §12: metadata from JWT). Creates/reuses the Stripe customer,
 * opens a one-time Checkout for the $99.99 lifetime Premium, and records
 * a pending transaction for the admin ledger (plan §5.5, §8.4).
 */
paymentRouter.post(
  "/create-checkout-session",
  verifyJWT,
  requireRole("vendor"),
  asyncHandler(async (req, res) => {
    requirePayments()

    const user = await User.findById(req.user!.id).lean()
    if (!user) throw ApiError.unauthorized("Account no longer exists.")
    if (isPremiumActive(user)) {
      throw ApiError.invalidState(
        "Premium is already active on this account."
      )
    }

    // Reuse the stored customer; stale ids (deleted in Stripe) fall through
    // to a fresh customer instead of failing checkout.
    let customerId: string | null = user.stripeCustomerId ?? null
    if (customerId) {
      const existing = await stripe.customers
        .retrieve(customerId)
        .catch(() => null)
      if (!existing || existing.deleted) customerId = null
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { vendorId: String(user._id) },
      })
      customerId = customer.id
      await User.updateOne(
        { _id: user._id },
        { $set: { stripeCustomerId: customerId } }
      )
    }

    // Clicking Upgrade repeatedly must not leave stale pending rows; a
    // checkout that was already completed stays success (webhook upserts
    // only what is still pending → success).
    await Transaction.updateMany(
      { vendorId: user._id, status: "pending" },
      { $set: { status: "failed" } }
    )

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      client_reference_id: String(user._id),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PREMIUM_CURRENCY,
            unit_amount: PREMIUM_PRICE_CENTS,
            product_data: {
              name: "PizzaHub Premium (Lifetime)",
              description:
                "One-time payment: unlimited menu items, featured placement, and the Premium badge — forever.",
            },
          },
        },
      ],
      metadata: { vendorId: String(user._id) },
      success_url: `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.CLIENT_URL}/payment/cancel`,
    })

    await Transaction.create({
      vendorId: user._id,
      plan: "premium",
      amount: PREMIUM_PRICE_CENTS,
      currency: PREMIUM_CURRENCY,
      stripeSessionId: session.id,
      status: "pending",
    })

    res.json(
      ApiResponse.success("Checkout session created.", {
        url: session.url,
        sessionId: session.id,
      })
    )
  })
)

// ── Vendor: premium state ───────────────────────────────────────────────

/** The success page polls this — it never activates premium itself (§5.5). */
paymentRouter.get(
  "/subscription",
  verifyJWT,
  requireRole("vendor"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id).lean()
    if (!user) throw ApiError.unauthorized("Account no longer exists.")

    res.json(
      ApiResponse.success("Premium state loaded.", subscriptionState(user))
    )
  })
)

// ── Admin: read-only ledger ─────────────────────────────────────────────

paymentRouter.get(
  "/transactions",
  verifyJWT,
  requireRole("admin"),
  validate({ query: transactionListQuery }),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = validatedQuery<{
      status?: "pending" | "success" | "failed"
      page?: number
      limit?: number
    }>(req)

    const filter: Record<string, unknown> = status ? { status } : {}
    const { page: p, limit: l, skip } = parsePagination({ page, limit }, 10)

    const [total, transactions] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate("vendorId", "name email businessName")
        .lean(),
    ])

    res.json(
      ApiResponse.paginated(
        "Transactions loaded.",
        transactions.map(serializeTransaction),
        buildPagination(p, l, total)
      )
    )
  })
)

// ── Webhook ─────────────────────────────────────────────────────────────

/**
 * One-time payment: checkout completion is the ONLY activation path, and
 * it only ever comes from this signature-verified webhook — the success
 * page never activates (plan §5.5). Premium is lifetime, so nothing ever
 * expires or downgrades afterwards.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.mode !== "payment") return

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null
  const vendorId = session.metadata?.vendorId ?? session.client_reference_id

  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"

  const user =
    (vendorId ? await User.findById(vendorId) : null) ??
    (customerId ? await User.findOne({ stripeCustomerId: customerId }) : null)

  if (!user) {
    // Ack the event (200) but surface it: a paid session without an
    // account is a mapping bug worth seeing in the logs.
    console.error(
      `[stripe] no user maps to vendor=${vendorId ?? "none"} customer=${customerId ?? "none"}`
    )
    return
  }

  // Idempotent ledger upsert keyed by stripeSessionId (plan §5.5, §8.4);
  // replays of the same event are no-ops on an already-success row.
  await Transaction.updateOne(
    { stripeSessionId: session.id },
    {
      $set: {
        vendorId: user._id,
        plan: "premium",
        amount: session.amount_total ?? PREMIUM_PRICE_CENTS,
        currency: session.currency ?? PREMIUM_CURRENCY,
        status: paid ? "success" : "pending",
      },
    },
    { upsert: true }
  )

  // Card Checkout captures immediately, so `paid` is the whole gate.
  if (paid) {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          subscriptionPlan: "premium",
          // Lifetime: clear any stale expiry/cancel state from the past.
          subscriptionExpiresAt: null,
          subscriptionCancelAtPeriodEnd: false,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
        },
      }
    )
  }
}

async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      await handleCheckoutCompleted(event.data.object)
      return
    }
    case "checkout.session.expired": {
      const session = event.data.object
      await Transaction.updateOne(
        { stripeSessionId: session.id, status: "pending" },
        { $set: { status: "failed" } }
      )
      return
    }
    default:
      // One-time checkout needs only the two events above; payment_intent,
      // charge, and the rest are acknowledged without touching state.
      return
  }
}

/**
 * Mounted in app.ts with express.raw BEFORE express.json (plan §6.3).
 * Returns Stripe's `{ received: true }` envelope, not the API envelope
 * (plan §9.1). Invalid signature → 400; handler failure → 500 so Stripe
 * retries instead of dropping the state change.
 */
export const stripeWebhook: RequestHandler = async (req, res) => {
  const signature = req.headers["stripe-signature"]
  if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe] webhook rejected: missing signature or secret")
    res.status(400).json({ received: false })
    return
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    )
  } catch (error) {
    console.error(
      `[stripe] webhook signature verification failed: ${(error as Error).message}`
    )
    res.status(400).json({ received: false })
    return
  }

  try {
    await connectDb()
    await dispatchStripeEvent(event)
    res.status(200).json({ received: true })
  } catch (error) {
    console.error(
      `[stripe] ${event.type} handler failed: ${(error as Error).message}`
    )
    res.status(500).json({ received: false })
  }
}
