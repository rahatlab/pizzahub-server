import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z
    .string()
    .min(1)
    .default("mongodb://127.0.0.1:27017/pizzahub"),
  MONGODB_DB: z.string().min(1).default("pizzahub"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  CLIENT_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_ORIGINS: z.string().default(""),
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  IMGBB_API_KEY: z.string().default(""),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ")
  throw new Error(`Invalid server environment: ${details}`)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === "production"

export const allowedOrigins = [
  env.CLIENT_URL,
  ...env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
].filter((origin, index, list) => list.indexOf(origin) === index)
