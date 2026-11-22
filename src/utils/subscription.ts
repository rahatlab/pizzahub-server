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
        subscriptionCancelAtPeriodEnd: false,
      },
    }
  )

  user.subscriptionPlan = "free"
  user.subscriptionCancelAtPeriodEnd = false

  await deactivateExtraVendorItems(String(user._id))
  return user
}

/**
 * Free plan: keep the three oldest approved items, deactivate any extras.
 */
export async function deactivateExtraVendorItems(vendorId: string): Promise<void> {
  const approved = await MenuItem.find({ vendorId, status: "approved" })
    .sort({ createdAt: 1 })
    .select("_id")
    .lean()

  if (approved.length <= FREE_PLAN_ITEM_LIMIT) return

  const extras = approved
    .slice(FREE_PLAN_ITEM_LIMIT)
    .map((item) => item._id)

  await MenuItem.updateMany(
    { _id: { $in: extras } },
    { $set: { status: "inactive" } }
  )
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
