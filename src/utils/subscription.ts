import { FREE_PLAN_ITEM_LIMIT } from "../config/constants"
import { MenuItem } from "../models/MenuItem"
import { User } from "../models/User"
import { isPast } from "./dates"

type AnyUser = Record<string, any>

export function isPremiumActive(user: AnyUser): boolean {
  return (
    user.subscriptionPlan === "premium" &&
    (!user.subscriptionExpiresAt || !isPast(user.subscriptionExpiresAt))
  )
}

/**
 * Keeps a vendor's plan and active-item count coherent if a Stripe webhook
 * was missed. Called from the JWT middleware for vendor requests.
 */
export async function syncUserSubscription(user: AnyUser): Promise<AnyUser> {
  if (user.role !== "vendor") return user
  if (user.subscriptionPlan !== "premium") return user
  if (!user.subscriptionExpiresAt || !isPast(user.subscriptionExpiresAt)) {
    return user
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        subscriptionPlan: "free",
        // Match the webhook downgrade path exactly (see payment.ts):
        // a free plan carries no expiry date.
        subscriptionExpiresAt: null,
        subscriptionCancelAtPeriodEnd: false,
      },
    }
  )

  user.subscriptionPlan = "free"
  user.subscriptionExpiresAt = null
  user.subscriptionCancelAtPeriodEnd = false

  await trimVendorToFreeLimit(String(user._id))
  return user
}

export type FreeLimitTrim = {
  /** Approved items moved to `inactive`. */
  deactivated: number
  /** Pending items sent back as `rejected` so they are no longer counted. */
  rejected: number
}

/**
 * Free plan counts pending + approved items, so a downgrade can overflow
 * through either status. Keep approved items first (they are the live menu),
 * then the oldest pending items, up to the limit. Approved extras go
 * inactive; pending extras are rejected — they cannot be self-approved, and
 * the reason tells the vendor why before they edit and resubmit.
 */
export async function trimVendorToFreeLimit(
  vendorId: string
): Promise<FreeLimitTrim> {
  const [approved, pending] = await Promise.all([
    MenuItem.find({ vendorId, status: "approved" })
      .sort({ createdAt: 1 })
      .select("_id")
      .lean(),
    MenuItem.find({ vendorId, status: "pending" })
      .sort({ createdAt: 1 })
      .select("_id")
      .lean(),
  ])

  if (approved.length + pending.length <= FREE_PLAN_ITEM_LIMIT) {
    return { deactivated: 0, rejected: 0 }
  }

  const keepApproved = Math.min(approved.length, FREE_PLAN_ITEM_LIMIT)
  const keepPending = Math.max(0, FREE_PLAN_ITEM_LIMIT - keepApproved)

  const approvedExtras = approved
    .slice(keepApproved)
    .map((item) => item._id)
  const pendingExtras = pending.slice(keepPending).map((item) => item._id)

  if (approvedExtras.length > 0) {
    await MenuItem.updateMany(
      { _id: { $in: approvedExtras } },
      { $set: { status: "inactive" } }
    )
  }

  if (pendingExtras.length > 0) {
    await MenuItem.updateMany(
      { _id: { $in: pendingExtras } },
      {
        $set: {
          status: "rejected",
          rejectionReason:
            "Free plan allows 3 items. This item is over the limit after the plan change.",
        },
      }
    )
  }

  return { deactivated: approvedExtras.length, rejected: pendingExtras.length }
}

export async function countNonRejectedItems(vendorId: string): Promise<number> {
  return MenuItem.countDocuments({
    vendorId,
    status: { $in: ["pending", "approved"] },
  })
}

export async function countApprovedItems(
  vendorId: string,
  excludeItemId?: string
): Promise<number> {
  return MenuItem.countDocuments({
    vendorId,
    status: "approved",
    ...(excludeItemId ? { _id: { $ne: excludeItemId } } : {}),
  })
}
