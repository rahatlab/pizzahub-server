import { Router } from "express"
import { User } from "../models/User"
import { MenuItem } from "../models/MenuItem"
import { Order } from "../models/Order"
import { verifyJWT } from "../middleware/verifyJWT"
import { requireRole } from "../middleware/requireRole"
import { validate, validatedQuery, validatedParams, validatedBody } from "../middleware/validate"
import { userListQuery, idParam } from "../validators/schemas"
import { ApiResponse } from "../utils/ApiResponse"
import { ApiError } from "../utils/ApiError"
import { asyncHandler } from "../utils/asyncHandler"
import { serializeUser } from "../utils/serialize"
import { buildPagination, parsePagination, parseString } from "../utils/pagination"
import { escapeRegex } from "../utils/escapeRegex"

export const usersRouter = Router()

/**
 * Fresh user for the session (plan §9.2): role/plan/blocked straight from
 * Mongo on every call.
 */
usersRouter.get(
  "/me",
  verifyJWT,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id).lean()
    if (!user) throw ApiError.unauthorized("Account no longer exists.")
    if (user.isBlocked) {
      throw new ApiError(403, "Account blocked.", "ACCOUNT_BLOCKED")
    }

    res.json(ApiResponse.success("Current user loaded.", serializeUser(user)))
  })
)

// ── Admin user management ────────────────────────────────────────────────

usersRouter.get(
  "/",
  verifyJWT,
  requireRole("admin"),
  validate({ query: userListQuery }),
  asyncHandler(async (req, res) => {
    const { search, role, page, limit } = validatedQuery<{
      search?: string
      role?: "customer" | "vendor" | "admin"
      page?: number
      limit?: number
    }>(req)

    const filter: Record<string, unknown> = {}
    const term = parseString(search)
    if (term) {
      const rx = new RegExp(escapeRegex(term), "i")
      filter.$or = [{ name: rx }, { email: rx }]
    }
    if (role) filter.role = role

    const { page: p, limit: l, skip } = parsePagination({ page, limit }, 10)
    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .lean(),
    ])

    res.json(
      ApiResponse.paginated(
        "Users loaded.",
        users.map(serializeUser),
        buildPagination(p, l, total)
      )
    )
  })
)

usersRouter.get(
  "/:id",
  verifyJWT,
  requireRole("admin"),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const user = await User.findById(id).lean()
    if (!user) throw ApiError.notFound("User not found.")

    const [itemCount, ordersPlaced, ordersReceived] = await Promise.all([
      MenuItem.countDocuments({ vendorId: id }),
      Order.countDocuments({ customerId: id }),
      Order.countDocuments({ vendorId: id }),
    ])

    res.json(
      ApiResponse.success("User detail loaded.", {
        user: serializeUser(user),
        stats: {
          menuItems: itemCount,
          ordersPlaced,
          ordersReceived,
        },
      })
    )
  })
)

/**
 * Block a user; a blocked vendor's items go inactive (plan §11, §12).
 * Admins cannot block themselves or other admins.
 */
usersRouter.patch(
  "/:id/block",
  verifyJWT,
  requireRole("admin"),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)

    if (id === req.user!.id) {
      throw ApiError.forbidden("You cannot block yourself.")
    }

    const user = await User.findById(id)
    if (!user) throw ApiError.notFound("User not found.")
    if (user.role === "admin") {
      throw ApiError.forbidden("Admin accounts cannot be blocked.")
    }

    if (!user.isBlocked) {
      user.isBlocked = true
      await user.save()

      if (user.role === "vendor") {
        await MenuItem.updateMany(
          { vendorId: user._id, status: { $in: ["pending", "approved"] } },
          { $set: { status: "inactive" } }
        )
      }
    }

    res.json(ApiResponse.success("User blocked.", serializeUser(user)))
  })
)

usersRouter.patch(
  "/:id/unblock",
  verifyJWT,
  requireRole("admin"),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: string }>(req)
    const user = await User.findById(id)
    if (!user) throw ApiError.notFound("User not found.")

    if (user.isBlocked) {
      user.isBlocked = false
      await user.save()
    }

    res.json(ApiResponse.success("User unblocked.", serializeUser(user)))
  })
)
