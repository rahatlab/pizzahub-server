import { Router } from "express"
import { MenuItem } from "../models/MenuItem.js"
import { User } from "../models/User.js"
import { connectDbMiddleware } from "../middleware/connectDb.js"
import { verifyJWT } from "../middleware/verifyJWT.js"
import { requireRole, assertOwner } from "../middleware/requireRole.js"
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from "../middleware/validate.js"
import {
  idParam,
  menuAdminListQuery,
  menuAvailabilityBody,
  menuCreateBody,
  menuListQuery,
  menuStatusBody,
  menuUpdateBody,
  menuVendorListQuery,
} from "../validators/schemas.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { serializeMenuItem } from "../utils/serialize.js"
import { buildPagination, parsePagination, parseString } from "../utils/pagination.js"
import { escapeRegex } from "../utils/escapeRegex.js"
import { countNonRejectedItems, isPremiumActive } from "../utils/subscription.js"
import { FREE_PLAN_ITEM_LIMIT, MENU_CATEGORIES } from "../config/constants.js"
import type { AuthUser } from "../types/domain.js"

export const menuRouter = Router()

// Public menu routes query Mongo without JWT, so this router connects on
// its own (verifyJWT covers the rest of the API).
menuRouter.use(connectDbMiddleware)

const VENDOR_POPULATE =
  "name businessName image subscriptionPlan ratingAvg"

/** Free plan: 3 counted items (pending + approved); premium is unlimited. */
function assertWithinFreeLimit(user: AuthUser, currentCount: number): void {
  if (isPremiumActive(user)) return
  if (currentCount >= FREE_PLAN_ITEM_LIMIT) {
    throw ApiError.planLimit(
      `Free plan allows ${FREE_PLAN_ITEM_LIMIT} active menu items. Upgrade to Premium for unlimited items.`
    )
  }
}

// ── Public ───────────────────────────────────────────────────────────────

/**
 * Approved items only, with search + category/location filters +
 * price sort + pagination (challenge #1, plan §9.4).
 */
menuRouter.get(
  "/",
  validate({ query: menuListQuery }),
  asyncHandler(async (req, res) => {
    const { search, category, location, sort, page, limit } = validatedQuery<{
      search?: string
      category?: string
      location?: string
      sort?: "price_asc" | "price_desc" | "newest"
      page?: number
      limit?: number
    }>(req)

    const filter: Record<string, unknown> = { status: "approved" }

    const term = parseString(search)
    if (term) {
      const rx = new RegExp(escapeRegex(term), "i")
      filter.$or = [{ itemName: rx }, { description: rx }]
    }
    if (category) filter.category = category
    if (location) {
      filter.location = new RegExp(`^${escapeRegex(location)}$`, "i")
    }

    const sortSpec: Record<string, 1 | -1> =
      sort === "price_asc"
        ? { price: 1 }
        : sort === "price_desc"
          ? { price: -1 }
          : { createdAt: -1 }

    const { page: p, limit: l, skip } = parsePagination({ page, limit })

    const [total, items] = await Promise.all([
      MenuItem.countDocuments(filter),
      MenuItem.find(filter)
        .sort(sortSpec)
        .skip(skip)
        .limit(l)
        .populate("vendorId", VENDOR_POPULATE)
        .lean(),
    ])

    res.json(
      ApiResponse.paginated(
        "Menu loaded.",
        items.map(serializeMenuItem),
        buildPagination(p, l, total)
      )
    )
  })
)

/** Home page: up to 8 approved items, active premium vendors first. */
menuRouter.get(
  "/featured",
  asyncHandler(async (_req, res) => {
    const now = new Date()
    const premiumVendors = await User.find({
      role: "vendor",
      isBlocked: false,
      subscriptionPlan: "premium",
      $or: [
        { subscriptionExpiresAt: null },
        { subscriptionExpiresAt: { $gt: now } },
      ],
    })
      .select("_id")
      .lean()

    const premiumIds = premiumVendors.map((v) => v._id)
    const limit = 8

    const base = { status: "approved" as const }
    let items =
      premiumIds.length > 0
        ? await MenuItem.find({ ...base, vendorId: { $in: premiumIds } })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate("vendorId", VENDOR_POPULATE)
            .lean()
        : []

    if (items.length < limit) {
      const filled = await MenuItem.find({
        ...base,
        ...(premiumIds.length > 0 ? { vendorId: { $nin: premiumIds } } : {}),
        ...(items.length > 0 ? { _id: { $nin: items.map((i) => i._id) } } : {}),
      })
        .sort({ createdAt: -1 })
        .limit(limit - items.length)
        .populate("vendorId", VENDOR_POPULATE)
        .lean()
      items = items.concat(filled)
    }

    res.json(
      ApiResponse.success(
        "Featured items loaded.",
        items.map(serializeMenuItem)
      )
    )
  })
)

/** Filter counts for the browse sidebar (approved items only). */
menuRouter.get(
  "/filters",
  asyncHandler(async (_req, res) => {
    const [categoryCounts, locationCounts] = await Promise.all([
      MenuItem.aggregate<{ _id: string; count: number }>([
        { $match: { status: "approved" } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      MenuItem.aggregate<{ _id: string; count: number }>([
        { $match: { status: "approved" } },
        { $group: { _id: "$location", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ])

    // All six assignment categories, even with zero items.
    const byCategory = new Map(categoryCounts.map((c) => [c._id, c.count]))
    const categories = MENU_CATEGORIES.map((value) => ({
      value,
      count: byCategory.get(value) ?? 0,
    }))

    res.json(
      ApiResponse.success("Filters loaded.", {
        categories,
        locations: locationCounts.map((l) => ({ value: l._id, count: l.count })),
      })
    )
  })
)

// Route order matters: static paths must precede "/:id".
menuRouter.get(
  "/vendor/me",
  verifyJWT,
  requireRole("vendor"),
  validate({ query: menuVendorListQuery }),
  asyncHandler(async (req, res) => {
    const { search, status, page, limit } = validatedQuery<{
      search?: string
      status?: string
      page?: number
      limit?: number
    }>(req)

    const filter: Record<string, unknown> = { vendorId: req.user!.id }
    const term = parseString(search)
    if (term) {
      const rx = new RegExp(escapeRegex(term), "i")
      filter.$or = [{ itemName: rx }, { description: rx }]
    }
    if (status) filter.status = status

    const { page: p, limit: l, skip } = parsePagination({ page, limit })
    const [total, items] = await Promise.all([
      MenuItem.countDocuments(filter),
      MenuItem.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .lean(),
    ])

    res.json(
      ApiResponse.paginated(
        "Your menu items loaded.",
        items.map(serializeMenuItem),
        buildPagination(p, l, total)
      )
    )
  })
)

menuRouter.get(
  "/admin/all",
  verifyJWT,
  requireRole("admin"),
  validate({ query: menuAdminListQuery }),
  asyncHandler(async (req, res) => {
    const { search, status, category, page, limit } = validatedQuery<{
      search?: string
      status?: string
      category?: string
      page?: number
      limit?: number
    }>(req)

    const filter: Record<string, unknown> = {}
    const term = parseString(search)
    if (term) {
      const rx = new RegExp(escapeRegex(term), "i")
      filter.$or = [{ itemName: rx }, { description: rx }]
    }
    if (status) filter.status = status
    if (category) filter.category = category

    const { page: p, limit: l, skip } = parsePagination({ page, limit })
    const [total, items] = await Promise.all([
      MenuItem.countDocuments(filter),
      MenuItem.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate("vendorId", VENDOR_POPULATE)
        .lean(),
    ])

    res.json(
      ApiResponse.paginated(
        "All menu items loaded.",
        items.map(serializeMenuItem),
        buildPagination(p, l, total)
      )
    )
  })
)

/** Public detail: approved only, anything else → 404 (plan §9.2). */
menuRouter.get(
  "/:id",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const item = await MenuItem.findOne({ _id: id, status: "approved" })
      .populate("vendorId", VENDOR_POPULATE)
      .lean()

    if (!item) throw ApiError.notFound("Menu item not found.")

    res.json(ApiResponse.success("Menu item loaded.", serializeMenuItem(item)))
  })
)

// ── Vendor ───────────────────────────────────────────────────────────────

menuRouter.post(
  "/",
  verifyJWT,
  requireRole("vendor"),
  validate({ body: menuCreateBody }),
  asyncHandler(async (req, res) => {
    const input = validatedBody<{
      itemName: string
      category: string
      description: string
      price: number
      location: string
      images: string[]
    }>(req)

    const count = await countNonRejectedItems(req.user!.id)
    assertWithinFreeLimit(req.user!, count)

    const item = await MenuItem.create({
      ...input,
      vendorId: req.user!.id,
      status: "pending",
    })

    res
      .status(201)
      .json(ApiResponse.success("Menu item submitted for review.", serializeMenuItem(item)))
  })
)

menuRouter.patch(
  "/:id",
  verifyJWT,
  requireRole("vendor"),
  validate({ params: idParam, body: menuUpdateBody }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const input = validatedBody<Record<string, unknown>>(req)

    const item = await MenuItem.findById(id)
    if (!item) throw ApiError.notFound("Menu item not found.")
    assertOwner(item.vendorId, req.user!, "You can only edit your own items.")

    const editable = [
      "itemName",
      "category",
      "description",
      "price",
      "location",
      "images",
    ] as const
    for (const field of editable) {
      if (input[field] !== undefined) {
        ;(item as unknown as Record<string, unknown>)[field] = input[field]
      }
    }

    // rejected → pending on vendor edit (plan §8.6); that adds the item back
    // to the counted set, so the free limit must still hold.
    if (item.status === "rejected") {
      const count = await countNonRejectedItems(req.user!.id)
      assertWithinFreeLimit(req.user!, count)
      item.status = "pending"
      item.rejectionReason = null
    }

    await item.save()
    res.json(ApiResponse.success("Menu item updated.", serializeMenuItem(item)))
  })
)

menuRouter.delete(
  "/:id",
  verifyJWT,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const item = await MenuItem.findById(id)
    if (!item) throw ApiError.notFound("Menu item not found.")

    const isOwner =
      req.user!.role === "vendor" && String(item.vendorId) === req.user!.id
    const isAdmin = req.user!.role === "admin"
    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden("You can only delete your own items.")
    }

    // Orders keep snapshots, so deletion never corrupts order history.
    await item.deleteOne()
    res.json(ApiResponse.success("Menu item deleted.", { id }))
  })
)

/** approved ↔ inactive; reactivating counts against the free limit. */
menuRouter.patch(
  "/:id/availability",
  verifyJWT,
  requireRole("vendor"),
  validate({ params: idParam, body: menuAvailabilityBody }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const { status } = validatedBody<{ status: "approved" | "inactive" }>(req)

    const item = await MenuItem.findById(id)
    if (!item) throw ApiError.notFound("Menu item not found.")
    assertOwner(item.vendorId, req.user!, "You can only update your own items.")

    if (item.status !== "approved" && item.status !== "inactive") {
      throw ApiError.invalidState(
        "Only approved or inactive items can change availability."
      )
    }

    if (status === "approved" && item.status === "inactive") {
      const count = await countNonRejectedItems(req.user!.id)
      assertWithinFreeLimit(req.user!, count)
    }

    item.status = status
    await item.save()
    res.json(ApiResponse.success("Availability updated.", serializeMenuItem(item)))
  })
)

// ── Admin moderation ─────────────────────────────────────────────────────

menuRouter.patch(
  "/:id/status",
  verifyJWT,
  requireRole("admin"),
  validate({ params: idParam, body: menuStatusBody }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const { status, rejectionReason } = validatedBody<{
      status: "approved" | "rejected" | "inactive"
      rejectionReason?: string
    }>(req)

    const item = await MenuItem.findById(id)
    if (!item) throw ApiError.notFound("Menu item not found.")

    // Approving an uncounted (rejected/inactive) item adds to the vendor's
    // counted set — free vendors stay capped at 3 (plan §11).
    if (
      status === "approved" &&
      item.status !== "pending" &&
      item.vendorId
    ) {
      const vendor = await User.findById(item.vendorId).lean()
      if (vendor) {
        const count = await countNonRejectedItems(String(item.vendorId))
        const proxyUser: AuthUser = {
          id: String(vendor._id),
          name: vendor.name ?? "",
          email: vendor.email ?? "",
          image: vendor.image ?? null,
          role: vendor.role,
          isBlocked: Boolean(vendor.isBlocked),
          businessName: vendor.businessName ?? null,
          subscriptionPlan:
            vendor.subscriptionPlan === "premium" ? "premium" : "free",
          subscriptionExpiresAt: vendor.subscriptionExpiresAt ?? null,
          subscriptionCancelAtPeriodEnd: Boolean(
            vendor.subscriptionCancelAtPeriodEnd
          ),
          stripeCustomerId: vendor.stripeCustomerId ?? null,
        }
        assertWithinFreeLimit(proxyUser, count)
      }
    }

    item.status = status
    item.rejectionReason =
      status === "rejected" ? (rejectionReason ?? "Rejected by admin") : null
    await item.save()

    res.json(ApiResponse.success(`Item ${status}.`, serializeMenuItem(item)))
  })
)
