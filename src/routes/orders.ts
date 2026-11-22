import { Router } from "express"
import { Order } from "../models/Order"
import { MenuItem } from "../models/MenuItem"
import { User } from "../models/User"
import { verifyJWT } from "../middleware/verifyJWT"
import { requireRole } from "../middleware/requireRole"
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from "../middleware/validate"
import {
  idParam,
  orderCreateBody,
  orderListQuery,
  orderRejectBody,
} from "../validators/schemas"
import { ApiResponse } from "../utils/ApiResponse"
import { ApiError } from "../utils/ApiError"
import { asyncHandler } from "../utils/asyncHandler"
import { serializeOrder } from "../utils/serialize"
import { buildPagination, parsePagination } from "../utils/pagination"
import { normalizeDeliveryDate } from "../utils/dates"

export const ordersRouter = Router()

const CUSTOMER_POPULATE = "name email image"

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
  )
}

/**
 * Place an order (plan §5.6, §11): approved item only, vendor cannot order
 * own item, admins cannot order, duplicate active order blocked.
 */
ordersRouter.post(
  "/",
  verifyJWT,
  requireRole("customer", "vendor"),
  validate({ body: orderCreateBody }),
  asyncHandler(async (req, res) => {
    const input = validatedBody<{
      itemId: string
      deliveryDate: string
      deliveryAddress: string
      message?: string
    }>(req)

    const item = await MenuItem.findById(input.itemId)
    if (!item || item.status !== "approved") {
      throw ApiError.notFound("Menu item not found or not available.")
    }

    const itemVendorId = String(item.vendorId)
    if (itemVendorId === req.user!.id) {
      throw ApiError.forbidden("You cannot order your own item.")
    }

    const vendor = await User.findById(itemVendorId).lean()
    if (!vendor) throw ApiError.notFound("Vendor not found.")

    const deliveryDate = normalizeDeliveryDate(input.deliveryDate)

    // App-level duplicate guard; the partial unique index (pending/accepted)
    // is the race-proof backstop and surfaces as code 11000.
    const duplicate = await Order.findOne({
      itemId: item._id,
      customerId: req.user!.id,
      deliveryDate,
      status: { $in: ["pending", "accepted"] },
    }).lean()
    if (duplicate) {
      throw new ApiError(
        409,
        "You already have an active order for this item on that date.",
        "DUPLICATE_ORDER"
      )
    }

    let order
    try {
      order = await Order.create({
        itemId: item._id,
        vendorId: item.vendorId,
        customerId: req.user!.id,
        itemName: item.itemName,
        itemImage: item.images[0] ?? "",
        itemPrice: item.price,
        vendorName: vendor.businessName || vendor.name || "Vendor",
        deliveryDate,
        deliveryAddress: input.deliveryAddress,
        message: input.message ?? "",
        status: "pending",
      })
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ApiError(
          409,
          "You already have an active order for this item on that date.",
          "DUPLICATE_ORDER"
        )
      }
      throw error
    }

    res.status(201).json(ApiResponse.success("Order placed.", serializeOrder(order)))
  })
)

/** Orders the customer placed (vendors also order as customers). */
ordersRouter.get(
  "/my",
  verifyJWT,
  requireRole("customer", "vendor"),
  validate({ query: orderListQuery }),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = validatedQuery<{
      status?: string
      page?: number
      limit?: number
    }>(req)

    const filter: Record<string, unknown> = { customerId: req.user!.id }
    if (status) filter.status = status

    const { page: p, limit: l, skip } = parsePagination({ page, limit }, 10)
    const [total, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate("customerId", CUSTOMER_POPULATE)
        .lean(),
    ])

    res.json(
      ApiResponse.paginated(
        "Your orders loaded.",
        orders.map(serializeOrder),
        buildPagination(p, l, total)
      )
    )
  })
)

/** Incoming orders for the logged-in vendor. */
ordersRouter.get(
  "/vendor",
  verifyJWT,
  requireRole("vendor"),
  validate({ query: orderListQuery }),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = validatedQuery<{
      status?: string
      page?: number
      limit?: number
    }>(req)

    const filter: Record<string, unknown> = { vendorId: req.user!.id }
    if (status) filter.status = status

    const { page: p, limit: l, skip } = parsePagination({ page, limit }, 10)
    const [total, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate("customerId", CUSTOMER_POPULATE)
        .lean(),
    ])

    res.json(
      ApiResponse.paginated(
        "Incoming orders loaded.",
        orders.map(serializeOrder),
        buildPagination(p, l, total)
      )
    )
  })
)

// Static paths before "/:id".
ordersRouter.get(
  "/:id",
  verifyJWT,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const order = await Order.findById(id)
      .populate("customerId", CUSTOMER_POPULATE)
      .lean()
    if (!order) throw ApiError.notFound("Order not found.")

    const isCustomer = String(order.customerId?._id ?? order.customerId) === req.user!.id
    const isVendor = String(order.vendorId) === req.user!.id
    const isAdmin = req.user!.role === "admin"
    if (!isCustomer && !isVendor && !isAdmin) {
      throw ApiError.forbidden("You do not have access to this order.")
    }

    res.json(ApiResponse.success("Order loaded.", serializeOrder(order)))
  })
)

/**
 * Atomic pending-only transition (plan §8.6): the filter includes both the
 * owner and `status: pending`, so a concurrent request can never double-fire.
 */
async function transitionOrder(
  id: string,
  actor: { id: string; role: string },
  allowedRole: "vendor" | "customer",
  nextStatus: "accepted" | "rejected" | "cancelled",
  extra: Record<string, unknown> = {}
): Promise<Record<string, any>> {
  const order = await Order.findById(id).lean()
  if (!order) throw ApiError.notFound("Order not found.")

  const isVendorActor = String(order.vendorId) === actor.id
  const isCustomerActor = String(order.customerId) === actor.id

  if (allowedRole === "vendor" && !isVendorActor) {
    throw ApiError.forbidden("This order is not awaiting your action.")
  }
  if (allowedRole === "customer" && !isCustomerActor) {
    throw ApiError.forbidden("You can only cancel your own orders.")
  }
  if (order.status !== "pending") {
    throw ApiError.invalidState(
      `This order is already ${order.status} and cannot be changed.`
    )
  }

  const ownerField = allowedRole === "vendor" ? "vendorId" : "customerId"
  const updated = await Order.findOneAndUpdate(
    { _id: id, status: "pending", [ownerField]: actor.id },
    { $set: { status: nextStatus, ...extra } },
    { new: true }
  ).lean()

  if (!updated) {
    throw ApiError.invalidState("This order is no longer pending.")
  }
  return updated
}

ordersRouter.patch(
  "/:id/accept",
  verifyJWT,
  requireRole("vendor"),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const updated = await transitionOrder(id, req.user!, "vendor", "accepted")
    res.json(ApiResponse.success("Order accepted.", serializeOrder(updated)))
  })
)

ordersRouter.patch(
  "/:id/reject",
  verifyJWT,
  requireRole("vendor"),
  validate({ params: idParam, body: orderRejectBody }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const { rejectionReason } = validatedBody<{ rejectionReason?: string }>(req)
    const updated = await transitionOrder(id, req.user!, "vendor", "rejected", {
      rejectionReason: rejectionReason ?? null,
    })
    res.json(ApiResponse.success("Order rejected.", serializeOrder(updated)))
  })
)

ordersRouter.patch(
  "/:id/cancel",
  verifyJWT,
  requireRole("customer", "vendor"),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const updated = await transitionOrder(id, req.user!, "customer", "cancelled")
    res.json(ApiResponse.success("Order cancelled.", serializeOrder(updated)))
  })
)
