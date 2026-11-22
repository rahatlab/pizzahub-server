import type { AuthUser, RequestValidation } from "./domain"

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
      validated?: RequestValidation
    }
  }
}

export {}
