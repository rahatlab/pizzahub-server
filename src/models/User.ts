import mongoose, { Schema, model, type Model } from "mongoose"
import { ROLES } from "../config/constants"

const userSchema = new Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: null },
    role: {
      type: String,
      enum: ROLES,
      default: "customer",
    },
    isBlocked: { type: Boolean, default: false },
    businessName: { type: String, default: null },
    subscriptionPlan: {
      type: String,
      enum: ["free", "premium"],
      default: "free",
    },
    subscriptionExpiresAt: { type: Date, default: null },
    subscriptionCancelAtPeriodEnd: { type: Boolean, default: false },
    stripeCustomerId: { type: String, default: null },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  {
    collection: "users",
    timestamps: true,
    versionKey: false,
    autoIndex: false,
  }
)

userSchema.index({ role: 1 })
userSchema.index({ isBlocked: 1 })

export const User: Model<any> =
  (mongoose.models.User as Model<any>) ?? model("User", userSchema)
