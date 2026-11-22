import mongoose, { Schema, model, type Model } from "mongoose"
import { ORDER_STATUSES } from "../config/constants"

const orderSchema = new Schema(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    itemName: { type: String, required: true },
    itemImage: { type: String, required: true },
    itemPrice: { type: Number, required: true, min: 0 },
    vendorName: { type: String, required: true },
    deliveryDate: { type: Date, required: true },
    deliveryAddress: { type: String, required: true, trim: true },
    message: { type: String, default: "" },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending",
    },
    rejectionReason: { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    autoIndex: false,
  }
)

orderSchema.index({ vendorId: 1, status: 1, createdAt: -1 })
orderSchema.index({ customerId: 1, status: 1, createdAt: -1 })
orderSchema.index({ deliveryDate: 1 })
orderSchema.index(
  { itemId: 1, customerId: 1, deliveryDate: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "accepted"] } },
  }
)

export const Order: Model<any> =
  (mongoose.models.Order as Model<any>) ?? model("Order", orderSchema)
