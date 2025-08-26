const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  location: { type: String, default: '' },
  department: { type: String, default: '' },
  bio: { type: String, default: '' },
  language: { type: String, default: 'English' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  role: { type: String, enum: ['admin', 'moderator'], default: 'admin' },
  personalInfo: {
    email: { type: String },
  },
  avatar: { type: String, default: '/placeholder.svg' },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'admins' });

module.exports = mongoose.model('Admin', adminSchema);