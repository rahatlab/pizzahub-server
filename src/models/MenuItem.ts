import mongoose, { Schema, model, type Model } from "mongoose"
import { MENU_CATEGORIES, MENU_STATUSES } from "../config/constants.js"

const menuItemSchema = new Schema(
  {
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    itemName: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: MENU_CATEGORIES,
      required: true,
    },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    location: { type: String, required: true, trim: true },
    images: {
      type: [String],
      required: true,
      validate: {
        validator: (images: string[]) =>
          Array.isArray(images) && images.length >= 1 && images.length <= 5,
        message: "Menu items need between 1 and 5 images.",
      },
    },
    status: {
      type: String,
      enum: MENU_STATUSES,
      default: "pending",
    },
    rejectionReason: { type: String, default: null },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
    autoIndex: false,
  }
)

menuItemSchema.index({ vendorId: 1, status: 1 })
menuItemSchema.index({ status: 1, createdAt: -1 })
menuItemSchema.index({ category: 1 })
menuItemSchema.index({ location: 1 })
menuItemSchema.index({ itemName: "text", description: "text" })

export const MenuItem: Model<any> =
  (mongoose.models.MenuItem as Model<any>) ?? model("MenuItem", menuItemSchema)
