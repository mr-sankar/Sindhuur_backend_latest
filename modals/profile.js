const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  age: {
    type: Number,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  profession: {
    type: String,
    required: true,
  },
  education: {
    type: String,
    required: true,
  },
  height: {
    type: String,
    required: true,
  },
  community: {
    type: String,
    required: true,
  },
  motherTongue: {
    type: String,
    required: true,
  },
  salary: {
    type: String,
    required: true,
  },
  about: {
    type: String,
    required: true,
  },
  images: {
    type: [String],
    required: true,
  },
  family: {
    father: { type: String, required: true },
    mother: { type: String, required: true },
    siblings: { type: String, required: true },
  },
  preferences: {
    type: [String],
    required: true,
  },
});

module.exports = mongoose.model('Profile', profileSchema);