const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportingUserId: {
    type: String,
    required: true,
  },
  reportedProfileId: {
    type: String,
    required: true,
  },
  details: {
    type: [String],
    required: true,
    validate: {
      validator: function (arr) {
        return arr.length === 9; // Ensure exactly 9 fields: reportingUserId, reportedProfileId, reason, category, message, name, location, profession, education
      },
      message: 'Details array must contain exactly 9 fields',
    },
  },
  category: {
    type: String,
    default: null,
  },
  priority: {
    type: String,
    default: "Medium",
  },
  assignedTo: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["open", "in_progress", "resolved", "closed"],
    default: "open",
  },
  resolutionNotes: {
    type: String,
    default: null,
  },
  actionTaken: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  indexes: [
    { key: { reportingUserId: 1, reportedProfileId: 1 }, unique: true }
  ]
});

module.exports = mongoose.model('Report', reportSchema);