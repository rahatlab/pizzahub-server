import mongoose, { Schema, model, type Model } from "mongoose"

const transactionSchema = new Schema(
  {
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    plan: {
      type: String,
      enum: ["premium"],
      default: "premium",
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "usd" },
    stripeSessionId: { type: String, required: true, unique: true },
    stripeSubscriptionId: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
    versionKey: false,
    autoIndex: false,
  }
)

transactionSchema.index({ vendorId: 1, createdAt: -1 })
transactionSchema.index({ status: 1 })
transactionSchema.index({ createdAt: -1 })

export const Transaction: Model<any> =
  (mongoose.models.Transaction as Model<any>) ??
  model("Transaction", transactionSchema)
