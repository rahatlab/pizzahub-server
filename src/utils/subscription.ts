import { FREE_PLAN_ITEM_LIMIT } from "../config/constants.js"
import { MenuItem } from "../models/MenuItem.js"
import { User } from "../models/User.js"
import { isPast } from "./dates.js"

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
 * through either status. Keep the three oldest counted items: approved
 * extras go inactive, pending extras are rejected (pending → inactive would
 * let the vendor self-approve them) with a reason they can act on.
 */
export async function trimVendorToFreeLimit(
  vendorId: string
): Promise<FreeLimitTrim> {
  const counted = await MenuItem.find({
    vendorId,
    status: { $in: ["pending", "approved"] },
  })
    .sort({ createdAt: 1 })
    .select("_id status")
    .lean()

  const extras = counted.slice(FREE_PLAN_ITEM_LIMIT)
  const approvedIds = extras
    .filter((item) => item.status === "approved")
    .map((item) => item._id)
  const pendingIds = extras
    .filter((item) => item.status === "pending")
    .map((item) => item._id)

  if (approvedIds.length > 0) {
    await MenuItem.updateMany(
      { _id: { $in: approvedIds } },
      { $set: { status: "inactive" } }
    )
  }

  if (pendingIds.length > 0) {
    await MenuItem.updateMany(
      { _id: { $in: pendingIds } },
      {
        $set: {
          status: "rejected",
          rejectionReason:
            "Free plan allows 3 items. This item is over the limit after the plan change.",
        },
      }
    )
  }

  return { deactivated: approvedIds.length, rejected: pendingIds.length }
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
