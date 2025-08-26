const bcrypt = require('bcryptjs');
const Admin = require('./modals/admin/adminSchema');

const adminUsers = [
  {
    name: 'Admin User',
    email: process.env.ADMIN_EMAIL || 'admin@matrimony.com',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    phone: '+91 9876543210',
    location: 'Mumbai, Maharashtra',
    department: 'Administration',
    bio: 'Experienced administrator managing matrimony platform operations.',
    language: 'English',
    timezone: 'Asia/Kolkata',
    avatar: '/placeholder.svg',
  },
  // Add more admin users here as needed, e.g.:
  // {
  //   name: 'Second Admin',
  //   email: 'admin2@matrimony.com',
  //   password: 'securepassword456',
  //   phone: '+91 9123456789',
  //   location: 'Delhi, India',
  //   department: 'Operations',
  //   bio: 'Overseeing platform operations and user management.',
  //   language: 'English',
  //   timezone: 'Asia/Kolkata',
  //   avatar: '/placeholder.svg',
  // }
];

const createAdmins = async () => {
  try {
    for (const adminData of adminUsers) {
      const { email, password, name, phone, location, department, bio, language, timezone, avatar } = adminData;
      const adminExists = await Admin.findOne({ email });
      if (adminExists) {
        console.log(`Admin user already exists: ${email}`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const admin = new Admin({
        name,
        email,
        password: hashedPassword,
        phone,
        location,
        department,
        bio,
        language,
        timezone,
        role: 'admin',
        personalInfo: { email },
        avatar,
        createdAt: new Date(),
      });
      await admin.save();
      console.log(`Admin user created successfully: ${email}`);
    }
  } catch (error) {
    console.error('Error creating admins:', error);
    throw error;
  }
};

module.exports = { createAdmins, adminUsers };