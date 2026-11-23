import type { PaginationMeta } from "../types/domain.js"

export type ResponseMeta = {
  timestamp: string
  pagination?: PaginationMeta
}

export class ApiResponse<T> {
  success: boolean
  message: string
  data?: T
  meta: ResponseMeta

  constructor(
    success: boolean,
    message: string,
    data?: T,
    pagination?: PaginationMeta
  ) {
    this.success = success
    this.message = message
    if (data !== undefined) this.data = data
    this.meta = {
      timestamp: new Date().toISOString(),
      ...(pagination ? { pagination } : {}),
    }
  }

  static success<T>(message: string, data: T): ApiResponse<T> {
    return new ApiResponse(true, message, data)
  }

  static paginated<T>(
    message: string,
    data: T[],
    pagination: PaginationMeta
  ): ApiResponse<T[]> {
    return new ApiResponse(true, message, data, pagination)
  }
}
