const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true }, // Changed to Date
  time: { type: String, required: true }, // Keep time as string for simplicity
  location: { type: String, required: true },
  type: {
    type: String,
    enum: ["meetup", "webinar", "workshop", "conference"],
    required: true,
  },
  status: {
    type: String,
    enum: ["upcoming", "ongoing", "completed", "cancelled"],
    default: "upcoming",
  },
  maxAttendees: { type: Number, required: true },
  currentAttendees: { type: Number, default: 0 },
  isOnline: { type: Boolean, default: false },
  price: { type: Number, default: 0 },
  organizer: { type: String, required: true },
  createdDate: { type: Date, required: true }, // Changed to Date
  registeredUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  image: { type: String },
});

module.exports = mongoose.model("Event", eventSchema);