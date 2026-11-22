export const MENU_CATEGORIES = [
  "Classic Pizzas",
  "Vegetarian Pizzas",
  "Meat Lovers",
  "Specialty / Gourmet Pizzas",
  "Sides & Appetizers",
  "Beverages & Desserts",
] as const

export type MenuCategory = (typeof MENU_CATEGORIES)[number]

export const MENU_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "inactive",
] as const

export type MenuStatus = (typeof MENU_STATUSES)[number]

export const ORDER_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ROLES = ["customer", "vendor", "admin"] as const

export type Role = (typeof ROLES)[number]

export const FREE_PLAN_ITEM_LIMIT = 3
export const PREMIUM_PLAN_AMOUNT_CENTS = 999
export const PREMIUM_PLAN_CURRENCY = "usd"
export const MENU_PAGE_SIZE = 12
export const MAX_PAGE_SIZE = 50
