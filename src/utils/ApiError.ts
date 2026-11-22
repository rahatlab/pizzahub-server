export type ApiErrorDetail = {
  field: string
  issue: string
}

export class ApiError extends Error {
  statusCode: number
  code: string
  details?: ApiErrorDetail[]

  constructor(
    statusCode: number,
    message: string,
    code = "ERROR",
    details?: ApiErrorDetail[]
  ) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }

  static validation(
    details: ApiErrorDetail[],
    message = "Validation failed."
  ): ApiError {
    return new ApiError(400, message, "VALIDATION_ERROR", details)
  }

  static unauthorized(
    message = "Authentication required.",
    code = "UNAUTHORIZED"
  ): ApiError {
    return new ApiError(401, message, code)
  }

  static forbidden(
    message = "You do not have permission to do that.",
    code = "FORBIDDEN"
  ): ApiError {
    return new ApiError(403, message, code)
  }

  static notFound(message = "Resource not found."): ApiError {
    return new ApiError(404, message, "NOT_FOUND")
  }

  static conflict(
    message = "Request conflicts with the current state.",
    code = "CONFLICT"
  ): ApiError {
    return new ApiError(409, message, code)
  }

  static planLimit(message = "Upgrade to Premium to add more items."): ApiError {
    return new ApiError(403, message, "PLAN_LIMIT")
  }

  static invalidState(message = "This action is not allowed in the current state."): ApiError {
    return new ApiError(409, message, "INVALID_STATE")
  }
}
