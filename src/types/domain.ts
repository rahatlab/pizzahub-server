import type { Role } from "../config/constants"

export type SubscriptionPlan = "free" | "premium"

export type AuthUser = {
  id: string
  name: string
  email: string
  image: string | null
  role: Role
  isBlocked: boolean
  businessName: string | null
  subscriptionPlan: SubscriptionPlan
  subscriptionExpiresAt: Date | null
  subscriptionCancelAtPeriodEnd: boolean
  stripeCustomerId: string | null
}

export type PaginationMeta = {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
}

export type RequestValidation = {
  body?: unknown
  query?: unknown
  params?: unknown
}

export type SerializedUser = {
  id: string
  name: string
  email: string
  image: string | null
  role: Role
  isBlocked: boolean
  businessName: string | null
  subscriptionPlan: SubscriptionPlan
  subscriptionExpiresAt: string | null
  subscriptionCancelAtPeriodEnd: boolean
  stripeCustomerId?: string | null
}
