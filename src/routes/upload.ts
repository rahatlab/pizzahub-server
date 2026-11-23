import { Router } from "express"
import multer from "multer"
import { env } from "../config/env.js"
import { verifyJWT } from "../middleware/verifyJWT.js"
import { uploadLimiter } from "../middleware/rateLimit.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"

export const uploadRouter = Router()

const MAX_IMAGE_BYTES = 3 * 1024 * 1024 // Vercel body cap ~4.5MB (plan §6.2)
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

// Memory storage only — no filesystem writes on serverless (plan §6.2).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(
        new ApiError(400, "Only JPG, PNG, or WebP images are allowed.", "UPLOAD_FAILED")
      )
      return
    }
    cb(null, true)
  },
})

/**
 * ImgBB upload (plan §9.2): multipart image → base64 → ImgBB API, key kept
 * server-side. Returns the hosted URL the client stores on menu items.
 */
uploadRouter.post(
  "/imgbb",
  verifyJWT,
  uploadLimiter,
  upload.single("image"),
  asyncHandler(async (req, res) => {
    if (!env.IMGBB_API_KEY) {
      throw new ApiError(500, "Image uploads are not configured.", "UPLOAD_FAILED")
    }
    if (!req.file) {
      throw ApiError.validation(
        [{ field: "image", issue: "Choose an image to upload." }],
        "No image provided."
      )
    }

    const form = new FormData()
    form.set("image", req.file.buffer.toString("base64"))

    let upstream: Response
    try {
      upstream = await fetch(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(env.IMGBB_API_KEY)}`,
        { method: "POST", body: form, signal: AbortSignal.timeout(8_000) }
      )
    } catch {
      throw new ApiError(500, "Image upload failed. Try again.", "UPLOAD_FAILED")
    }

    const payload = (await upstream.json().catch(() => null)) as {
      success?: boolean
      data?: { url?: string; display_url?: string }
    } | null

    const url = payload?.data?.display_url ?? payload?.data?.url
    if (!upstream.ok || !payload?.success || !url) {
      throw new ApiError(500, "Image upload failed. Try again.", "UPLOAD_FAILED")
    }

    res.status(201).json(ApiResponse.success("Image uploaded.", { url }))
  })
)
