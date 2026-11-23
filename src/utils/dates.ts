import { ApiError } from "./ApiError.js"

export function startOfUtcDay(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "Enter a valid delivery date.", "VALIDATION_ERROR", [
      { field: "deliveryDate", issue: "Enter a valid date." },
    ])
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

export function normalizeDeliveryDate(value: string): Date {
  const date = startOfUtcDay(value)
  const today = startOfUtcDay(new Date())

  if (date.getTime() < today.getTime()) {
    throw new ApiError(
      400,
      "Delivery date cannot be in the past.",
      "VALIDATION_ERROR",
      [{ field: "deliveryDate", issue: "Choose today or a future date." }]
    )
  }

  return date
}

export function isPast(date: Date | null | undefined): boolean {
  return Boolean(date && date.getTime() < Date.now())
}
