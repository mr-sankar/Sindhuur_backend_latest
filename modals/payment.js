// models/payment.ts
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    plan: String,
    price: Number,
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "created",
    },
    isUpgrade: { type: Boolean, default: false },
    originalPlan: String, // Previous plan for upgrades
    upgradeType: String, // "free_to_premium", "premium_to_premium_plus"
    proratedAmount: Number, // Calculated prorated amount for upgrades
    remainingDays: Number, // Days remaining in current subscription
    originalPrice: Number, // Original plan price for reference
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
