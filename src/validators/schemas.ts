import { z } from "zod"
import { MENU_CATEGORIES, MENU_STATUSES, ORDER_STATUSES, ROLES } from "../config/constants.js"

/** Shared page/limit parsing (max 50 enforced in pagination.ts too). */
export const paginationQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
}

/** Route param that must be a 24-char hex ObjectId. */
export const idParam = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id."),
})

export const menuListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.enum(MENU_CATEGORIES).optional(),
  location: z.string().trim().max(120).optional(),
  sort: z.enum(["price_asc", "price_desc", "newest"]).optional(),
  ...paginationQuery,
})

export const menuVendorListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(MENU_STATUSES).optional(),
  ...paginationQuery,
})

export const menuAdminListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(MENU_STATUSES).optional(),
  category: z.enum(MENU_CATEGORIES).optional(),
  ...paginationQuery,
})

export const menuCreateBody = z.object({
  itemName: z.string().trim().min(3).max(120),
  category: z.enum(MENU_CATEGORIES),
  description: z.string().trim().min(10).max(2000),
  price: z.coerce.number().min(0).max(100_000),
  location: z.string().trim().min(2).max(120),
  images: z
    .array(z.string().url())
    .min(1, "Add at least one image.")
    .max(5, "Up to 5 images."),
})

export const menuUpdateBody = menuCreateBody.partial()

export const menuStatusBody = z
  .object({
    status: z.enum(["approved", "rejected", "inactive"]),
    rejectionReason: z.string().trim().min(3).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "rejected" && !value.rejectionReason) {
      ctx.addIssue({
        code: "custom",
        path: ["rejectionReason"],
        message: "A rejection reason is required.",
      })
    }
  })

export const menuAvailabilityBody = z.object({
  status: z.enum(["approved", "inactive"]),
})

export const orderCreateBody = z.object({
  itemId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid item id."),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  deliveryAddress: z.string().trim().min(5).max(300),
  message: z.string().trim().max(500).optional(),
})

export const orderRejectBody = z.object({
  rejectionReason: z.string().trim().min(3).max(500).optional(),
})

export const orderListQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  ...paginationQuery,
})

export const userListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.enum(ROLES).optional(),
  ...paginationQuery,
})

export const blockBody = z.object({
  isBlocked: z.boolean(),
})

export const transactionListQuery = z.object({
  status: z.enum(["pending", "success", "failed"]).optional(),
  ...paginationQuery,
})
