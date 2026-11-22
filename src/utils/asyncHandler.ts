import type { NextFunction, Request, RequestHandler, Response } from "express"

type AsyncRoute = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>

/**
 * Express 5 forwards async errors automatically, but this keeps handler intent
 * explicit and works if a handler is mounted on an older router.
 */
export function asyncHandler(handler: AsyncRoute): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}
