const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../modals/userSchema.js");
const Payment = require("../modals/payment.js");
const { config } = require("dotenv");

config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

// Middleware to parse JSON bodies
router.use(express.json());

const calculateProratedAmount = (currentPlan, newPlan, remainingDays) => {
  const planPrices = {
    free: 0,
    premium: 2999,
    "premium plus": 4999,
  };

  const planDurations = {
    premium: 90, // 3 months
    "premium plus": 180, // 6 months
  };

  const currentPlanPrice = planPrices[currentPlan.toLowerCase()] || 0;
  const newPlanPrice = planPrices[newPlan.toLowerCase()];
  const newPlanDuration = planDurations[newPlan.toLowerCase()];

  // Calculate daily rate for current plan
  const currentDailyRate =
    currentPlan === "free"
      ? 0
      : currentPlanPrice / planDurations[currentPlan.toLowerCase()];

  // Calculate refund for remaining days
  const refundAmount = currentDailyRate * remainingDays;

  // Calculate prorated amount (new plan price - refund)
  const proratedAmount = Math.max(0, newPlanPrice - refundAmount);

  return {
    proratedAmount: Math.round(proratedAmount),
    refundAmount: Math.round(refundAmount),
    newPlanPrice,
    remainingDays,
  };
};

// 🟢 Initiate Payment (Updated to handle upgrades)
router.post("/initiate", async (req, res) => {
  const { plan, price, userId, isUpgrade = false } = req.body;

  // Validate inputs
  if (!plan || !userId) {
    console.warn("Missing required fields:", { plan, userId });
    return res.status(400).json({
      success: false,
      message: "Missing required fields: plan and userId are required",
    });
  }

  // Validate plan
  const validPlans = ["premium", "premium plus"];
  if (!validPlans.includes(plan.toLowerCase())) {
    console.warn("Invalid plan:", plan);
    return res
      .status(400)
      .json({ success: false, message: "Invalid plan specified" });
  }

  // Validate user by profileId
  const user = await User.findOne({ profileId: userId });
  if (!user) {
    console.warn("User not found for profileId:", userId);
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const now = new Date();
  const currentPlan = user.subscription?.current || "free";
  const hasActiveSubscription = user.subscription?.details?.expiryDate > now;

  if (isUpgrade) {
    // Validate upgrade path
    const validUpgrades = {
      free: ["premium", "premium plus"],
      premium: ["premium plus"],
    };

    if (!validUpgrades[currentPlan]?.includes(plan.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid upgrade path from ${currentPlan} to ${plan}`,
      });
    }

    // Calculate prorated amount for active subscriptions
    let proratedData = { proratedAmount: 0, remainingDays: 0 };

    if (hasActiveSubscription && currentPlan !== "free") {
      const remainingTime = user.subscription.details.expiryDate - now;
      const remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
      proratedData = calculateProratedAmount(currentPlan, plan, remainingDays);
    } else if (currentPlan === "free") {
      // Free to premium/premium plus - full price
      const planPrices = { premium: 2999, "premium plus": 4999 };
      proratedData.proratedAmount = planPrices[plan.toLowerCase()];
    }

    try {
      const amount = proratedData.proratedAmount * 100; // Convert to paise
      const order = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: `upgrade_${Date.now()}`,
      });

      const upgradeType = `${currentPlan.replace(" ", "_")}_to_${plan
        .toLowerCase()
        .replace(" ", "_")}`;

      const payment = new Payment({
        userId: user._id,
        plan: plan.toLowerCase(),
        price: proratedData.proratedAmount,
        razorpayOrderId: order.id,
        status: "created",
        isUpgrade: true,
        originalPlan: currentPlan,
        upgradeType,
        proratedAmount: proratedData.proratedAmount,
        remainingDays: proratedData.remainingDays,
        originalPrice: proratedData.newPlanPrice,
      });

      await payment.save();

      res.json({
        success: true,
        order,
        paymentId: payment._id,
        upgradeDetails: proratedData,
      });
    } catch (err) {
      console.error("Upgrade payment initiation error:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Upgrade payment initiation failed" });
    }
  } else {
    if (hasActiveSubscription) {
      console.warn("User already has an active subscription:", {
        userId,
        currentPlan: user.subscription.current,
        expiryDate: user.subscription.details.expiryDate,
      });
      return res.status(403).json({
        success: false,
        message:
          "You already have an active subscription. Please upgrade your current plan instead.",
        currentPlan: user.subscription.current,
        expiryDate: user.subscription.details.expiryDate,
        canUpgrade: true,
      });
    }

    // Validate price for new subscriptions
    const parsedPrice = Number.parseInt(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      console.warn("Invalid price:", price);
      return res
        .status(400)
        .json({ success: false, message: "Invalid price value" });
    }

    try {
      const amount = parsedPrice * 100; // Convert to paise
      const order = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
      });

      const payment = new Payment({
        userId: user._id,
        plan: plan.toLowerCase(),
        price: amount / 100,
        razorpayOrderId: order.id,
        status: "created",
      });

      await payment.save();

      res.json({ success: true, order, paymentId: payment._id });
    } catch (err) {
      console.error("Payment initiation error:", err.message);
      res
        .status(500)
        .json({ success: false, message: "Payment initiation failed" });
    }
  }
});

router.post("/upgrade", async (req, res) => {
  const { newPlan, userId } = req.body;

  if (!newPlan || !userId) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: newPlan and userId are required",
    });
  }

  try {
    const user = await User.findOne({ profileId: userId });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const currentPlan = user.subscription?.current || "free";
    const now = new Date();
    const hasActiveSubscription = user.subscription?.details?.expiryDate > now;

    // Calculate upgrade details
    let remainingDays = 0;
    if (hasActiveSubscription && currentPlan !== "free") {
      const remainingTime = user.subscription.details.expiryDate - now;
      remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));
    }

    const upgradeDetails = calculateProratedAmount(
      currentPlan,
      newPlan,
      remainingDays
    );

    res.json({
      success: true,
      currentPlan,
      newPlan,
      upgradeDetails,
      canUpgrade: true,
    });
  } catch (err) {
    console.error("Upgrade calculation error:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to calculate upgrade details" });
  }
});

// ✅ Verify Payment (Updated to handle upgrades)
router.post("/verify", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    paymentId,
  } = req.body;

  // Validate inputs
  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature ||
    !paymentId
  ) {
    console.warn("Missing verification fields:", req.body);
    return res.status(400).json({
      success: false,
      message: "Missing required verification fields",
    });
  }

  // Verify signature
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    console.warn("Invalid signature received");
    return res
      .status(400)
      .json({ success: false, message: "Invalid signature" });
  }

  try {
    // Update payment status
    const payment = await Payment.findByIdAndUpdate(
      paymentId,
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: "paid",
      },
      { new: true }
    );

    if (!payment) {
      console.warn("Payment not found:", paymentId);
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    const now = new Date();
    const duration = payment.plan === "premium" ? 90 : 180; // Days

    let startDate, expiry;

    if (payment.isUpgrade) {
      // For upgrades, start immediately and calculate new expiry
      startDate = now;
      expiry = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);
    } else {
      // For new subscriptions, normal flow
      startDate = now;
      expiry = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);
    }

    // Get existing history
    const existingUser = await User.findById(payment.userId);
    const existingHistory = existingUser?.subscription?.history || [];

    const updatedHistory = [...existingHistory];
    if (payment.isUpgrade && existingHistory.length > 0) {
      // Mark the last active subscription as upgraded
      const lastActiveIndex = updatedHistory.findIndex(
        (h) => h.status === "active"
      );
      if (lastActiveIndex !== -1) {
        updatedHistory[lastActiveIndex].status = "upgraded";
        updatedHistory[lastActiveIndex].upgradedAt = now;
      }
    }

    const subscriptionUpdate = {
      subscription: {
        current: payment.plan,
        details: {
          startDate,
          expiryDate: expiry,
          paymentId: payment._id,
          autoRenew: false,
        },
        history: [
          ...updatedHistory,
          {
            type: payment.plan,
            startDate,
            expiryDate: expiry,
            paymentId: payment._id,
            status: "active",
            upgradedAt: now,
            isUpgrade: payment.isUpgrade || false,
            originalPlan: payment.originalPlan || null,
            proratedAmount: payment.proratedAmount || null,
          },
        ],
      },
    };

    const user = await User.findByIdAndUpdate(
      payment.userId,
      { $set: subscriptionUpdate },
      { runValidators: false, new: true }
    );

    if (!user) {
      console.warn("User not found for payment:", payment.userId);
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const message = payment.isUpgrade
      ? `Successfully upgraded to ${payment.plan}`
      : "Payment verified and subscription updated";

    res.json({
      success: true,
      message,
      isUpgrade: payment.isUpgrade,
      newPlan: payment.plan,
    });
  } catch (err) {
    console.error("Payment verification error:", err.message);
    res.status(500).json({ success: false, message: "Verification failed" });
  }
});

// 🟡 Get Total Revenue
router.get("/total-revenue", async (req, res) => {
  try {
    const totalRevenue = await Payment.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$price" } } },
    ]);

    const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

    res.json({
      success: true,
      totalRevenue: revenue,
      currency: "INR",
    });
  } catch (err) {
    console.error("Error fetching total revenue:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch total revenue" });
  }
});

module.exports = router;
