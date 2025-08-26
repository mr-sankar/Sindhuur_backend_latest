const mongoose = require('mongoose');

// Schema for individual interest entry inside array
const interestEntrySchema = new mongoose.Schema({
  profileId: {
    type: String,
    required: true,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
}, { _id: false }); // prevent automatic _id for subdocuments

// Main schema for interests grouped by user
const interestSchema = new mongoose.Schema({
  userProfileId: {
    type: String,
    required: true,
    unique: true, // Only one document per user
    ref: 'User',
  },
  interestedProfiles: [interestEntrySchema], // Array of interested profiles
}, {
  timestamps: true // optional: adds createdAt, updatedAt
});

module.exports = mongoose.model('Interest', interestSchema);
