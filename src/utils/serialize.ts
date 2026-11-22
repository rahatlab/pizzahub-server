type AnyDoc = Record<string, any>

function idOf(value: unknown): string {
  if (!value) return ""
  if (typeof value === "string") return value
  if (typeof value === "object" && value !== null) {
    const record = value as AnyDoc
    if (record._id) return String(record._id)
    if (typeof record.toHexString === "function") return record.toHexString()
  }
  return String(value)
}

function iso(value: unknown): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function serializeUser(user: AnyDoc) {
  return {
    id: idOf(user._id ?? user.id),
    name: user.name ?? "",
    email: user.email ?? "",
    image: user.image ?? null,
    role: user.role ?? "customer",
    isBlocked: Boolean(user.isBlocked),
    businessName: user.businessName ?? null,
    subscriptionPlan:
      user.subscriptionPlan === "premium" ? "premium" : "free",
    subscriptionExpiresAt: iso(user.subscriptionExpiresAt),
    subscriptionCancelAtPeriodEnd: Boolean(
      user.subscriptionCancelAtPeriodEnd
    ),
    stripeCustomerId: user.stripeCustomerId ?? null,
    createdAt: iso(user.createdAt),
    updatedAt: iso(user.updatedAt),
  }
}

export function serializeMenuItem(item: AnyDoc) {
  const vendor =
    item.vendorId &&
    typeof item.vendorId === "object" &&
    "name" in item.vendorId
      ? item.vendorId
      : null

  return {
    id: idOf(item._id),
    vendorId: vendor ? idOf(vendor._id) : idOf(item.vendorId),
    itemName: item.itemName ?? "",
    category: item.category ?? "",
    description: item.description ?? "",
    price: Number(item.price ?? 0),
    location: item.location ?? "",
    images: Array.isArray(item.images) ? item.images : [],
    status: item.status ?? "pending",
    rejectionReason: item.rejectionReason ?? null,
    ratingAvg: Number(item.ratingAvg ?? 0),
    ratingCount: Number(item.ratingCount ?? 0),
    vendor: vendor
      ? {
          id: idOf(vendor._id),
          name: vendor.name ?? "",
          businessName: vendor.businessName ?? null,
          image: vendor.image ?? null,
          subscriptionPlan:
            vendor.subscriptionPlan === "premium" ? "premium" : "free",
          ratingAvg: Number(vendor.ratingAvg ?? 0),
        }
      : undefined,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  }
}

export function serializeOrder(order: AnyDoc) {
  const customer =
    order.customerId &&
    typeof order.customerId === "object" &&
    "name" in order.customerId
      ? order.customerId
      : null

  return {
    id: idOf(order._id),
    itemId: idOf(order.itemId),
    vendorId: idOf(order.vendorId),
    customerId: customer ? idOf(customer._id) : idOf(order.customerId),
    itemName: order.itemName ?? "",
    itemImage: order.itemImage ?? "",
    itemPrice: Number(order.itemPrice ?? 0),
    vendorName: order.vendorName ?? "",
    deliveryDate: iso(order.deliveryDate),
    deliveryAddress: order.deliveryAddress ?? "",
    message: order.message ?? null,
    status: order.status ?? "pending",
    rejectionReason: order.rejectionReason ?? null,
    customer: customer
      ? {
          id: idOf(customer._id),
          name: customer.name ?? "",
          email: customer.email ?? "",
          image: customer.image ?? null,
        }
      : undefined,
    createdAt: iso(order.createdAt),
    updatedAt: iso(order.updatedAt),
  }
}

export function serializeTransaction(transaction: AnyDoc) {
  const vendor =
    transaction.vendorId &&
    typeof transaction.vendorId === "object" &&
    "name" in transaction.vendorId
      ? transaction.vendorId
      : null

  return {
    id: idOf(transaction._id),
    vendorId: vendor ? idOf(vendor._id) : idOf(transaction.vendorId),
    vendor: vendor
      ? {
          id: idOf(vendor._id),
          name: vendor.name ?? "",
          email: vendor.email ?? "",
          businessName: vendor.businessName ?? null,
        }
      : undefined,
    plan: transaction.plan ?? "premium",
    amount: Number(transaction.amount ?? 0),
    currency: transaction.currency ?? "usd",
    status: transaction.status ?? "pending",
    stripeSessionId: transaction.stripeSessionId ?? null,
    stripeSubscriptionId: transaction.stripeSubscriptionId ?? null,
    createdAt: iso(transaction.createdAt),
  }
}
