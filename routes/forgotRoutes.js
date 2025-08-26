// authRoutes.js
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const User = require("../modals/userSchema"); // your model

const router = express.Router();

// Config (tweak as needed / move to env)
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const RESET_JWT_EXPIRY = "15m"; // short lived reset token
const BCRYPT_ROUNDS = 12;

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Allow self-signed certificates
  },
});

// Helpers
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function hashOtp(plainOtp) {
  return crypto.createHash("sha256").update(plainOtp).digest("hex");
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Basic rate limiter for forgot-password endpoint
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 6, // max requests per window per IP
  message: {
    message: "Too many requests from this IP, please try again later.",
  },
});

// POST /api/auth/forgot-password
// Body: { email }
router.post("/forgot-password", forgotLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  const normalized = String(email).trim().toLowerCase();

  try {
    const user = await User.findOne({ "personalInfo.email": normalized });

    // Security: always return generic response to prevent account enumeration
    const genericResponse = {
      message: "If that email exists, a reset code has been sent.",
    };

    if (!user) {
      // intentionally do not reveal whether user exists
      return res.status(200).json(genericResponse);
    }

    // Generate OTP, hash it and store
    const otpPlain = generateOtp();
    const otpHash = hashOtp(otpPlain);

    user.otp = {
      code: otpHash,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      verified: true,
      attempts: 0,
      // resetTokenHash: undefined
    };

    await user.save();

    // Send the plain OTP via email (do not log OTP in production)
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: normalized,
      subject: "Your password reset code",
      text: `Your password reset code is ${otpPlain}. It expires in 10 minutes.`,
      html: `<p>Your password reset code is <b>${otpPlain}</b>. It expires in 10 minutes.</p>`,
    });

    return res.status(200).json(genericResponse);
  } catch (err) {
    console.error("forgot-password error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/auth/verify-otp
// Body: { email, otp }
// Returns: { message, resetToken } (resetToken is short lived JWT to authorize password reset)
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp)
    return res.status(400).json({ message: "Email and OTP are required" });

  const normalized = String(email).trim().toLowerCase();

  try {
    const user = await User.findOne({ "personalInfo.email": normalized });
    if (!user || !user.otp || !user.otp.code) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    // check expiry
    if (!user.otp.expiresAt || user.otp.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    // attempts guard
    user.otp.attempts = user.otp.attempts || 0;

    if (user.otp.attempts >= MAX_OTP_ATTEMPTS) {
      await user.save();
      return res
        .status(429)
        .json({ message: "Too many attempts. Request a new code." });
    }

    const providedHash = hashOtp(String(otp));
    if (providedHash !== user.otp.code) {
      user.otp.attempts += 1;
      await user.save();
      return res.status(400).json({ message: "Invalid code" });
    }

    // success -> mark verified and issue short-lived reset token (stateless)
    user.otp.verified = true;

    // create reset JWT and store its hash in DB to bind it to this user
    const resetToken = jwt.sign(
      { uid: user._id.toString(), type: "pwd_reset" },
      process.env.RESET_JWT_SECRET || process.env.JWT_SECRET,
      { expiresIn: RESET_JWT_EXPIRY }
    );
    user.otp.resetTokenHash = hashToken(resetToken);

    await user.save();

    // return the token to client (over HTTPS). Client should use token to call /reset-password
    return res.status(200).json({ message: "OTP verified", resetToken });
  } catch (err) {
    console.error("verify-otp error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/auth/reset-password
// Two supported flows:
//  - Preferred: { resetToken, password }  (resetToken from verify-otp)
//  - Fallback:  { email, otp, password }   (re-verify otp server-side)
// Always require strong password checks server-side
router.post("/reset-password", async (req, res) => {
  const { resetToken, email, otp, password } = req.body;

  if (!password || typeof password !== "string" || password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters" });
  }

  try {
    let user = null;

    if (resetToken) {
      // Preferred: verify reset JWT
      try {
        const payload = jwt.verify(
          resetToken,
          process.env.RESET_JWT_SECRET || process.env.JWT_SECRET
        );
        if (!payload || payload.type !== "pwd_reset")
          throw new Error("Invalid token payload");
        user = await User.findById(payload.uid);
        if (!user || !user.otp || !user.otp.resetTokenHash)
          throw new Error("Invalid token");
        // compare hash
        const tokenHash = hashToken(resetToken);
        if (tokenHash !== user.otp.resetTokenHash)
          throw new Error("Invalid token");
      } catch (err) {
        return res
          .status(400)
          .json({ message: "Invalid or expired reset token" });
      }
    } else {
      // Fallback: verify OTP again
      if (!email || !otp)
        return res.status(400).json({ message: "Email and OTP required" });
      const normalized = String(email).trim().toLowerCase();
      user = await User.findOne({ "personalInfo.email": normalized });
      if (!user || !user.otp || !user.otp.code) {
        return res.status(400).json({ message: "Invalid or expired code" });
      }
      // check expiry
      if (user.otp.expiresAt.getTime() < Date.now())
        return res.status(400).json({ message: "Invalid or expired code" });
      const providedHash = hashOtp(String(otp));
      if (providedHash !== user.otp.code) {
        user.otp.attempts = (user.otp.attempts || 0) + 1;
        await user.save();
        return res.status(400).json({ message: "Invalid code" });
      }
      // mark verified
      user.otp.verified = true;
    }

    // At this point `user` is found and verified; update password
    user.credentials.password = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // clear OTP-related fields to prevent reuse
    user.otp = {
      code: undefined,
      expiresAt: undefined,
      verified: true,
      attempts: 0,
      resetTokenHash: undefined,
    };

    await user.save();

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("reset-password error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
