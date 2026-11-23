import express from "express"
import helmet from "helmet"
import cors from "cors"
import { allowedOrigins } from "./config/env"
import { apiLimiter } from "./middleware/rateLimit"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler"
import { healthRouter } from "./routes/health"
import { usersRouter } from "./routes/users"
import { menuRouter } from "./routes/menu"
import { ordersRouter } from "./routes/orders"
import { uploadRouter } from "./routes/upload"
import { paymentRouter, stripeWebhook } from "./routes/payment"
import { dashboardRouter } from "./routes/dashboard"

const app = express()

// Vercel sits in front of the function — trust the first proxy hop for
// correct client IPs in rate limiting (plan §6.2).
app.set("trust proxy", 1)
app.disable("x-powered-by")

app.use(
  helmet({
    // JSON API consumed cross-origin by the Next.js client: CORP must allow
    // it, CSP is meaningless for JSON responses.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
)

app.use(
  cors({
    origin(origin, callback) {
      // No Origin = curl / Stripe webhook / server-to-server → allow.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
    allowedHeaders: ["Authorization", "Content-Type"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
)

// Stripe webhook FIRST: express.raw must see the untouched body for
// signature verification, before express.json — Vercel does not pre-parse
// bodies (plan §6.3, §9.3). Mounted outside the rate limiter: the Stripe
// signature is the auth, and throttling webhooks would drop state changes.
app.post(
  "/api/payment/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
)

app.use(express.json({ limit: "1mb" }))

// Health stays outside the DB middleware so it reports 200 even during a
// Mongo outage (plan §15: cold start → /api/health 200).
app.use("/api/health", healthRouter)

app.use("/api", apiLimiter)

// DB-backed routers connect lazily: verifyJWT opens the connection for
// authenticated routes, and the menu router connects for its public routes.
// Keeping connectDb off the top-level /api mount lets unmatched paths reach
// the 404 handler instead of failing on a DB outage.
app.use("/api/users", usersRouter)
app.use("/api/menu", menuRouter)
app.use("/api/orders", ordersRouter)
app.use("/api/upload", uploadRouter)
app.use("/api/payment", paymentRouter)
app.use("/api/dashboard", dashboardRouter)

app.use(notFoundHandler)
app.use(errorHandler)

// Vercel zero-config entry: default export, no listen (plan §6.1).
export default app
