const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    fromProfileId: { type: String, required: true }, // sender
    toProfileId: { type: String, required: true }, // receiver
    toUserName: { type: String }, // receiver name
    message: { type: String }, // optional custom message
    type: {
      type: String,
      enum: ["interest", "message", "match"],
      default: "interest",
    },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema({
  profileId: { type: String, unique: true, default: () => `KM${Date.now()}` },

  email: { type: String, required: false, unique: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },

  personalInfo: {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    gender: { type: String, enum: ["male", "female"], required: true },
    mobile: { type: String },
    lookingFor: { type: String },
    avatar: { type: String },
    profileComplete: { type: Number, default: 0 },
    document: { type: String },
    profileImage: { type: String },
    Status: {
      type: String,
      enum: ["active", "inactive", "banned"],
      default: "active",
    },
  },

  demographics: {
    dateOfBirth: { type: String, required: true },
    height: { type: String, required: true },
    maritalStatus: { type: String, required: true },
    religion: { type: String, required: true },
    community: { type: String, required: true },
    motherTongue: { type: String, required: true },
    timeOfBirth: { type: String },
    placeOfBirth: { type: String },
    chartStyle: { type: String, default: "South Indian" },
  },

  professionalInfo: {
    education: { type: String, required: true },
    fieldOfStudy: { type: String, required: false },
    occupation: { type: String, required: true },
    income: { type: String, required: true },
  },

  location: {
    city: { type: String, required: true },
    state: { type: String, required: true },
  },

  hobbies: { type: String, default: "Not specified" }, // Moved hobbies to top-level
  familyInfo: {
    father: { type: String, required: false },
    mother: { type: String, required: false },
  },

  familyTree: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
  },

  horoscope: {
    generated: { type: Boolean, default: false },
    compatibility: { type: String },
    luckyNumbers: { type: [Number] },
    luckyColors: { type: [String] },
    favorableTime: { type: String },
    message: { type: String },
  },

  credentials: {
    password: { type: String, required: true },
    rememberMe: { type: Boolean, default: false },
  },

  subscription: {
    current: {
      type: String,
      enum: ["free", "premium", "premium plus"],
      default: "free",
    },
    details: {
      startDate: { type: Date },
      expiryDate: { type: Date },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
      autoRenew: { type: Boolean, default: false },
    },
    history: [
      {
        type: { type: String, enum: ["free", "premium", "premium plus"] },
        startDate: { type: Date },
        expiryDate: { type: Date },
        paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
        status: {
          type: String,
          enum: ["active", "expired", "cancelled", "upgraded"], // Added "upgraded" status
          default: "active",
        },
        upgradedAt: { type: Date, default: Date.now },
        isUpgrade: { type: Boolean, default: false },
        originalPlan: { type: String }, // Previous plan for upgrades
        proratedAmount: { type: Number }, // Amount paid for upgrade
      },
    ],
  },
  registeredEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }],

  profileCreatedAt: { type: Date, default: Date.now },
  appVersion: { type: String, required: true },

  otp: {
    code: { type: String },
    expiresAt: { type: Date },
    verified: { type: Boolean, default: false },
  },

  profileStatus: {
    type: String,
    enum: ["active", "inactive", "flagged", "under_review"],
    default: "active",
  },
  chatContacts: { type: [String], default: [] },

  flagReasons: { type: [String], default: [] },
  photos: { type: Number, default: 0 },
  profileViews: { type: Number, default: 0 },
  lastActive: { type: Date },
  notifications: [notificationSchema],
});

// Validation logic
userSchema.pre("save", function (next) {
  if (!this.isNew) return next();

  if (!this.personalInfo.name) return next(new Error("Name is required"));
  if (!this.personalInfo.mobile)
    return next(new Error("Mobile number is required"));
  if (!this.personalInfo.gender) return next(new Error("Gender is required"));
  if (!this.personalInfo.lookingFor)
    return next(new Error("LookingFor is required"));

  const requiredFields = [
    "dateOfBirth",
    "height",
    "maritalStatus",
    "religion",
    "community",
    "motherTongue",
    "education",
    "occupation",
    "income",
    "city",
    "state",
    "father",
    "mother",
  ];

  for (const field of requiredFields) {
    const path =
      field in this.demographics
        ? this.demographics
        : field in this.professionalInfo
        ? this.professionalInfo
        : field in this.location
        ? this.location
        : field in this.familyInfo
        ? this.familyInfo
        : null;

    if (!path?.[field]) return next(new Error(`${field} is required`));
  }

  if (!this.familyTree) return next(new Error("Family tree is required"));
  if (!this.credentials.password)
    return next(new Error("Password is required"));
  if (!this.appVersion) return next(new Error("App version is required"));

  next();
});

module.exports = mongoose.model("User", userSchema);
