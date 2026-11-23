import { Router } from "express"
import { Types } from "mongoose"
import { MenuItem } from "../models/MenuItem"
import { Order } from "../models/Order"
import { Transaction } from "../models/Transaction"
import { User } from "../models/User"
import { verifyJWT } from "../middleware/verifyJWT"
import { requireRole } from "../middleware/requireRole"
import { ApiResponse } from "../utils/ApiResponse"
import { asyncHandler } from "../utils/asyncHandler"
import { serializeOrder } from "../utils/serialize"
import { ORDER_STATUSES } from "../config/constants"

export const dashboardRouter = Router()

type GroupCount = { _id: string; count: number }

async function groupOrders(
  match: Record<string, unknown>
): Promise<Record<string, number>> {
  const rows = await Order.aggregate<GroupCount>([
    { $match: match },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ])

  // Always return every status so charts have a stable shape.
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]))
  for (const row of rows) counts[row._id] = row.count
  return counts
}

/** Vendor overview (plan §9.2, §10): real counts only, no fake deltas. */
dashboardRouter.get(
  "/vendor",
  verifyJWT,
  requireRole("vendor"),
  asyncHandler(async (req, res) => {
    const vendorId = new Types.ObjectId(req.user!.id)

    const [totalItems, activeItems, pendingItems, orders, itemsByCategory, recentOrders] =
      await Promise.all([
        MenuItem.countDocuments({ vendorId }),
        MenuItem.countDocuments({ vendorId, status: "approved" }),
        MenuItem.countDocuments({ vendorId, status: "pending" }),
        groupOrders({ vendorId }),
        MenuItem.aggregate<GroupCount>([
          { $match: { vendorId } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        Order.find({ vendorId })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
      ])

    res.json(
      ApiResponse.success("Vendor dashboard loaded.", {
        stats: {
          totalItems,
          activeItems,
          pendingItems,
          pendingOrders: orders.pending,
          acceptedOrders: orders.accepted,
          rejectedOrders: orders.rejected,
          cancelledOrders: orders.cancelled,
          totalOrders: ORDER_STATUSES.reduce(
            (sum, status) => sum + orders[status],
            0
          ),
        },
        ordersByStatus: ORDER_STATUSES.map((status) => ({
          status,
          count: orders[status],
        })),
        itemsByCategory: itemsByCategory.map((row) => ({
          category: row._id,
          count: row.count,
        })),
        recentOrders: recentOrders.map(serializeOrder),
      })
    )
  })
)

/** Customer overview: total + per-status order counts. */
dashboardRouter.get(
  "/customer",
  verifyJWT,
  requireRole("customer", "vendor"),
  asyncHandler(async (req, res) => {
    const customerId = new Types.ObjectId(req.user!.id)

    const [orders, recentOrders] = await Promise.all([
      groupOrders({ customerId }),
      Order.find({ customerId }).sort({ createdAt: -1 }).limit(5).lean(),
    ])

    res.json(
      ApiResponse.success("Customer dashboard loaded.", {
        stats: {
          totalOrders: ORDER_STATUSES.reduce(
            (sum, status) => sum + orders[status],
            0
          ),
          pending: orders.pending,
          accepted: orders.accepted,
          rejected: orders.rejected,
          cancelled: orders.cancelled,
        },
        ordersByStatus: ORDER_STATUSES.map((status) => ({
          status,
          count: orders[status],
        })),
        recentOrders: recentOrders.map(serializeOrder),
      })
    )
  })
)

/** Admin overview: platform counts plus chart-ready breakdowns. */
dashboardRouter.get(
  "/admin",
  verifyJWT,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const [
      totalUsers,
      customers,
      vendors,
      admins,
      blockedUsers,
      premiumVendors,
      totalItems,
      pendingItems,
      approvedItems,
      totalOrders,
      orders,
      itemsByCategory,
      transactions,
      successfulTransactions,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "vendor" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ isBlocked: true }),
      User.countDocuments({ role: "vendor", subscriptionPlan: "premium" }),
      MenuItem.countDocuments({}),
      MenuItem.countDocuments({ status: "pending" }),
      MenuItem.countDocuments({ status: "approved" }),
      Order.countDocuments({}),
      groupOrders({}),
      MenuItem.aggregate<GroupCount>([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Transaction.countDocuments({}),
      Transaction.countDocuments({ status: "success" }),
    ])

    res.json(
      ApiResponse.success("Admin dashboard loaded.", {
        stats: {
          totalUsers,
          customers,
          vendors,
          admins,
          blockedUsers,
          premiumVendors,
          totalItems,
          pendingItems,
          approvedItems,
          totalOrders,
          pendingOrders: orders.pending,
          transactions,
          successfulTransactions,
        },
        ordersByStatus: ORDER_STATUSES.map((status) => ({
          status,
          count: orders[status],
        })),
        itemsByCategory: itemsByCategory.map((row) => ({
          category: row._id,
          count: row.count,
        })),
      })
    )
  })
)
