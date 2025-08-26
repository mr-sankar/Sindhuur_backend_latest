// modals/Story.js
const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  names: { type: String, required: true },
  weddingDate: { type: Date, required: true },
  location: { type: String, required: true },
  email: { type: String, required: true },
  story: { type: String, required: true },
  image: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Story', storySchema);