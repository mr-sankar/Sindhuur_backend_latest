const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require('fs');

const User = require("./modals/userSchema");
const Admin = require("./modals/admin/adminSchema");
const Interest = require("./modals/interest");
const reportRoutes = require("./routes/reports");
const jwt = require("jsonwebtoken");
const Story = require("./modals/Story");
const Message = require("./modals/messageSchema");


const authMiddleware = require("./middleware/auth");
const events = require("./routes/admin/eventsRoute");
const adminRoutes = require("./routes/admin/adminRoutes");
const forgotRoutes =  require("./routes/forgotRoutes");

const Razorpay = require("./routes/RazorPay");




// Load environment variables
dotenv.config();


// Create uploads directory if it doesn't exist
const directories = ['Uploads/avatars', 'Uploads/documents'];
directories.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'profileImage') {
      cb(null, 'Uploads/avatars/');
    } else if (file.fieldname === 'document') {
      cb(null, 'Uploads/documents/');
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const prefix = file.fieldname === 'profileImage' ? 'avatar' : 'document';
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  }
});


const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'profileImage') {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for profile image'), false);
      }
    } else if (file.fieldname === 'document') {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Only PDF, JPG, or PNG files are allowed for documents'), false);
      }
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'document', maxCount: 1 }
]);

const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173", // local vite
      "http://localhost:8080", // if you used 8080 before
      "https://sindhuur-frontend-9gsqlcz65-kella-sankars-projects.vercel.app" // deployed frontend
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/Uploads', express.static('Uploads'));

const storyUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'Uploads/stories/');
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `story-${uniqueSuffix}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed for story images'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).single('image');

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'Uploads/avatars/');
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `admin-avatar-${uniqueSuffix}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('avatar');

app.use(
  cors({
    origin: [
      "http://localhost:8080",
      "https://matrimony-hazel-omega.vercel.app",
    ],
    credentials: true,
  })
);
app.use("/api/auth", forgotRoutes);
app.use("/api/payment", Razorpay);
app.use("/api", events);
app.use("/api", reportRoutes);
app.use("/api/admin", adminRoutes);


// Socket.IO setup
const onlineUsers = new Map();

// MongoDB connection
const connectMongoDB = async () => {
  const mongoUri = process.env.MONGODB_URI;
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

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

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP in MongoDB
const storeOTP = async (email) => {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes
  try {
    const normalizedEmail = email.toLowerCase();
    const result = await User.updateOne(
      { "personalInfo.email": normalizedEmail },
      {
        $set: {
          "personalInfo.email": normalizedEmail,
          "otp.code": otp,
          "otp.expiresAt": expiresAt,
          "otp.verified": false,
        },
      },
      { upsert: true }
    );
    console.log(
      `OTP ${otp} stored for ${normalizedEmail}. Update result:`,
      result
    );
    return otp;
  } catch (error) {
    console.error(`Error storing OTP for ${email}:`, error.message, error);
    throw new Error("Failed to store OTP");
  }
};

// API Endpoints
app.get("/test", (req, res) => {
  res.json({ message: "Server is running" });
});

app.post("/api/send-email-otp", async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.warn(`Invalid email received: ${email}`);
    return res.status(400).json({ error: "Invalid email" });
  }
  try {
    const otp = await storeOTP(email);
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "KannadaMatch OTP Verification",
      text: `Your OTP for KannadaMatch verification is ${otp}. It is valid for 10 minutes.`,
    });
    console.log(`OTP ${otp} sent to ${email} (logged for development)`);
    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error sending OTP:", error.message);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

app.post("/api/verify-email-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp || !/^\d{6}$/.test(otp)) {
    console.warn(`Invalid input - Email: ${email}, OTP: ${otp}`);
    return res.status(400).json({ error: "Invalid email or OTP" });
  }
  try {
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ "personalInfo.email": normalizedEmail });
    if (!user) {
      console.warn(`User not found for email: ${normalizedEmail}`);
      return res.status(400).json({ error: "User not found" });
    }
    if (!user.otp || !user.otp.code) {
      console.warn(`No OTP found for email: ${normalizedEmail}`);
      return res.status(400).json({ error: "No OTP found" });
    }
    if (user.otp.code !== otp) {
      console.warn(
        `OTP mismatch for email: ${normalizedEmail}, provided: ${otp}, stored: ${user.otp.code}`
      );
      return res.status(400).json({ error: "Invalid OTP" });
    }
    if (new Date() > new Date(user.otp.expiresAt)) {
      console.warn(`OTP expired for email: ${normalizedEmail}`);
      return res.status(400).json({ error: "Expired OTP" });
    }
    await User.updateOne(
      { "personalInfo.email": normalizedEmail },
      { $set: { "otp.verified": true } }
    );
    console.log(`OTP ${otp} verified successfully for ${normalizedEmail}`);
    res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error("Error verifying OTP:", error.message);
    res.status(500).json({ error: "Failed to verify OTP" });
  }
});

app.post("/api/create-profile", async (req, res) => {
  const profileData = req.body;

  // Validate required fields for new profile creation
  const requiredFields = [
    "personalInfo.email",
    "personalInfo.name",
    "personalInfo.mobile",
    "personalInfo.gender",
    "personalInfo.lookingFor",
    "demographics.dateOfBirth",
    "demographics.height",
    "demographics.maritalStatus",
    "demographics.religion",
    "demographics.community",
    "demographics.motherTongue",
    "professionalInfo.education",
    "professionalInfo.fieldOfStudy",
    "professionalInfo.occupation",
    "professionalInfo.income",
    "location.city",
    "location.state",
    "credentials.password",
    // 'appVersion',
  ];

  const missingFields = requiredFields.filter((field) => {
    const [section, key] = field.split(".");
    return !profileData?.[section]?.[key];
  });

  if (missingFields.length > 0) {
    console.warn("Missing required fields:", missingFields);
    return res
      .status(400)
      .json({ error: "Missing required fields", missingFields });
  }

  try {
    const normalizedEmail = profileData.personalInfo.email.toLowerCase();
    const existingUser = await User.findOne({
      "personalInfo.email": normalizedEmail,
    });

    // Hash password
    profileData.credentials.password = await bcrypt.hash(
      profileData.credentials.password,
      10
    );

    // Prepare subscription data
    const subscriptionData = {
      current: profileData.subscription?.current || "free",
      details: profileData.subscription?.details || {
        startDate: new Date(),
        expiryDate: null,
        paymentId: null,
        autoRenew: false,
      },
      history: profileData.subscription?.history || [],
    };

    if (existingUser) {
      if (!existingUser.otp?.verified) {
        console.warn(`Email not verified for ${normalizedEmail}`);
        return res.status(400).json({ error: "Email not verified" });
      }

      await User.updateOne(
        { "personalInfo.email": normalizedEmail },
        {
          $set: {
            profileId: existingUser.profileId || `KM${Date.now()}`,
            personalInfo: {
              ...profileData.personalInfo,
              email: normalizedEmail,
              lastActive: new Date(),
            },
            demographics: profileData.demographics,
            professionalInfo: profileData.professionalInfo,
            location: profileData.location,
            credentials: {
              ...profileData.credentials,
              rememberMe: profileData.credentials.rememberMe || false,
            },
            subscription: subscriptionData,
            profileCreatedAt: new Date(),
            appVersion: profileData.appVersion,
          },
        }
      );

      console.log("Profile updated:", {
        profileId: existingUser.profileId,
        email: normalizedEmail,
        subscription: subscriptionData.current,
      });

      return res.status(201).json({
        message: "Profile updated successfully",
        profileId: existingUser.profileId,
        email: normalizedEmail,
        subscription: subscriptionData.current,
      });
    }

    // Create new user
    const newUser = new User({
      profileId: `KM${Date.now()}`,
      personalInfo: {
        ...profileData.personalInfo,
        email: normalizedEmail,
        lastActive: new Date(),
      },
      demographics: profileData.demographics,
      professionalInfo: profileData.professionalInfo,
      location: profileData.location,
      credentials: {
        ...profileData.credentials,
        rememberMe: profileData.credentials.rememberMe || false,
      },
      subscription: subscriptionData,
      profileCreatedAt: new Date(),
      appVersion: profileData.appVersion,
      otp: profileData.otp || { verified: false },
    });

    await newUser.save();

    console.log("Profile created:", {
      profileId: newUser.profileId,
      email: newUser.personalInfo.email,
      subscription: newUser.subscription.current,
    });

    return res.status(201).json({
      message: "Profile created successfully",
      profileId: newUser.profileId,
      email: newUser.personalInfo.email,
      subscription: newUser.subscription.current,
    });
  } catch (error) {
    console.error("Error creating profile:", error.message);
    if (error.code === 11000) {
      return res.status(400).json({ error: "Email already exists" });
    }
    return res
      .status(500)
      .json({ error: `Failed to create profile: ${error.message}` });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  // Input validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.warn(`Invalid email format: ${email}`);
    return res.status(400).json({ error: "Invalid email format" });
  }

  if (!password || password.length < 6) {
    console.warn(`Invalid password length for email: ${email}`);
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  }

  try {
    const normalizedEmail = email.toLowerCase();

    // Find user in either User or Admin collection
    let user =
      (await User.findOne({ "personalInfo.email": normalizedEmail })) ||
      (await Admin.findOne({
        $or: [
          { email: normalizedEmail },
          { "personalInfo.email": normalizedEmail },
        ],
      }));

    if (!user) {
      console.warn(`User not found: ${normalizedEmail}`);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isAdmin =
      user instanceof Admin ||
      user.role === "admin" ||
      user.role === "moderator";

    // OTP verification for non-admin users (User collection only)
    if (!isAdmin && user instanceof User && !user.otp?.verified) {
      console.warn(`Email not verified for: ${normalizedEmail}`);
      return res.status(400).json({ error: "Email not verified" });
    }

    // Password validation
    const storedPassword = isAdmin ? user.password : user.credentials?.password;
    if (!storedPassword) {
      console.warn(`No password stored for: ${normalizedEmail}`);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, storedPassword);
    if (!isPasswordValid) {
      console.warn(`Invalid password for: ${normalizedEmail}`);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if the user is flagged (for non-admin users only)
    if (!isAdmin && user instanceof User && user.profileStatus === "flagged") {
      console.warn(`Access denied for flagged user: ${normalizedEmail}`);
      return res.status(403).json({
        error:
          "Access Denied: Your account has been flagged. Please contact support.",
      });
    }

    // Generate JWT
    const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"; // Ensure SECRET_KEY is defined
    const tokenPayload = isAdmin
      ? { userId: user._id, email: user.email, role: user.role }
      : {
          profileId: user.profileId,
          email: user.personalInfo.email,
          role: user.role,
        };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: isAdmin ? "1h" : "7d",
    });

    // Update lastActive timestamp for non-admin users
    if (!isAdmin && user instanceof User) {
      await User.updateOne(
        { _id: user._id },
        { $set: { "personalInfo.lastActive": new Date() } }
      );
    }

    // Prepare response data
    const userData = isAdmin
      ? {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || "",
          location: user.location || "",
          department: user.department || "",
          bio: user.bio || "",
          language: user.language || "English",
          timezone: user.timezone || "Asia/Kolkata",
          role: user.role,
          avatar: user.avatar || "/placeholder.svg",
        }
      : {
          profileId: user.profileId,
          role: user.role,
          name: user.personalInfo.name,
          email: user.personalInfo.email,
          mobile: user.personalInfo.mobile,
          gender: user.personalInfo.gender,
          lookingFor: user.personalInfo.lookingFor,
          lastActive: user.lastActive,
          dateOfBirth: user.demographics.dateOfBirth,
          height: user.demographics.height,
          maritalStatus: user.demographics.maritalStatus,
          religion: user.demographics.religion,
          community: user.demographics.community,
          motherTongue: user.demographics.motherTongue,
          education: user.professionalInfo.education,
          occupation: user.professionalInfo.occupation,
          income: user.professionalInfo.income,
          city: user.location.city,
          state: user.location.state,
          subscription: {
            current: user.subscription.current,
            details: user.subscription.details,
            history: user.subscription.history,
          },
          profileCreatedAt: user.profileCreatedAt,
          appVersion: user.appVersion,
        };

    user.lastActive = new Date();
    await user.save();
    console.log(
      `Login successful for: ${normalizedEmail} (${
        isAdmin ? "Admin/Moderator" : "User"
      })`
    );
    return res.status(200).json({
      message: "Login successful",
      token,
      user: userData,
    });
  } catch (error) {
    console.error(`Login error for ${email}:`, error.message);
    return res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/profiles", async (req, res) => {
  try {
    const users = await User.find({ "otp.verified": true }).select(
      "profileId personalInfo.name personalInfo.gender personalInfo.profileImage demographics.dateOfBirth professionalInfo.occupation location.city location.state professionalInfo.education demographics.community demographics.religion professionalInfo.income horoscope.generated photos subscription.current"
    );

    // Define BASE_URL (from env or fallback)
    const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

    const profiles = users.map((user) => {
      // Calculate age with validation
      let age = null;
      if (user.demographics.dateOfBirth) {
        const dob = new Date(user.demographics.dateOfBirth);
        if (!isNaN(dob.getTime())) {
          const today = new Date();
          age = Math.floor((today - dob) / (1000 * 60 * 60 * 24 * 365));
          if (age < 0 || age > 120) age = null;
        }
      }

      // Determine image URL
      let image = "https://www.shutterstock.com/image-vector/user-profile-icon-vector-avatar-600nw-2220431045.jpg"
        + "?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80"; // default fallback
      if (user.personalInfo?.profileImage) {
        if (user.personalInfo.profileImage.startsWith("http")) {
          image = user.personalInfo.profileImage; // already a full URL
        } else {
          const cleanPath = user.personalInfo.profileImage.startsWith("/")
            ? user.personalInfo.profileImage.slice(1)
            : user.personalInfo.profileImage;
          image = `${BASE_URL}/${cleanPath}`;
        }
      } else if (user.photos > 0) {
        image = `https://your-image-base-url/${user.profileId}.jpg`; // from first route logic
      }

      return {
        id: user.profileId,
        name: user.personalInfo.name || "Not specified",
        gender: user.personalInfo.gender || "Not specified",
        age: age || "Not specified",
        profession: user.professionalInfo.occupation || "Not specified",
        location:
          user.location.city && user.location.state
            ? `${user.location.city}, ${user.location.state}`
            : user.location.city || "Not specified",
        education: user.professionalInfo.education || "Not specified",
        community: user.demographics.community || "Not specified",
        religion: user.demographics.religion || "Not specified",
        income: user.professionalInfo.income || "Not specified",
        horoscope: user.horoscope?.generated || false,
        image,
        photos: user.photos || 0,
        subscription:
          user.subscription?.current || user.subscription || "free",
      };
    });

    console.log(`Fetched ${profiles.length} profiles`);
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Error fetching profiles:", error.message);
    res
      .status(500)
      .json({ error: `Failed to fetch profiles: ${error.message}` });
  }
});


app.get("/api/user-profile", async (req, res) => {
  try {
    const { email, profileId } = req.query;

    if (!email && !profileId) {
      return res.status(400).json({ error: "Email or Profile ID is required" });
    }

    // Build query dynamically
    const query = profileId
      ? { profileId }
      : { "personalInfo.email": email.toLowerCase() };

    // Fetch user, but project only required fields (optional)
    const user = await User.findOne(query).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.otp?.verified) {
      return res.status(400).json({ error: "Email not verified" });
    }

    // Build profileData safely with defaults
    const profileData = {
      profileId: user.profileId,
      name: user.personalInfo?.name || "Not specified",
      email: user.personalInfo?.email || "Not specified",
      mobile: user.personalInfo?.mobile || "Not specified",
      gender: user.personalInfo?.gender || "Not specified",
      lookingFor: user.personalInfo?.lookingFor || "Not specified",
      profileImage: user.personalInfo?.profileImage || null,
      document: user.personalInfo?.document || null,
      dateOfBirth: user.demographics?.dateOfBirth || "Not specified",
      timeOfBirth: user.demographics?.timeOfBirth || "Not specified",
      placeOfBirth: user.demographics?.placeOfBirth || "Not specified",
      familyTree: user.familyTree || [],
      height: user.demographics?.height || "Not specified",
      maritalStatus: user.demographics?.maritalStatus || "Not specified",
      religion: user.demographics?.religion || "Not specified",
      community: user.demographics?.community || "Not specified",
      motherTongue: user.demographics?.motherTongue || "Not specified",
      education: user.professionalInfo?.education || "Not specified",
      fieldOfStudy: user.professionalInfo?.fieldOfStudy || "Not specified",
      occupation: user.professionalInfo?.occupation || "Not specified",
      income: user.professionalInfo?.income || "Not specified",
      city: user.location?.city || "Not specified",
      state: user.location?.state || "Not specified",
      subscription: user.subscription || {},
      profileCreatedAt: user.profileCreatedAt,
      appVersion: user.appVersion || "Unknown",
      Status: user.personalInfo?.Status || "Not specified",
      fatherOccupation: user.familyInfo?.father || "Not specified",
      motherOccupation: user.familyInfo?.mother || "Not specified",
      profileComplete: user.personalInfo.profileComplete,
      hobbies: user.hobbies || "Not specified",
      horoscope: user.horoscope || {
        generated: false,
        compatibility: "",
        luckyNumbers: [],
        luckyColors: [],
        favorableTime: "",
        message: "",
      },
    };

    // Send response
    res.status(200).json({
      message: "Profile retrieved successfully",
      user: profileData,
    });

    console.log("User profile sent:", profileData);
  } catch (error) {
    console.error("Error retrieving profile:", error.message);
    res.status(500).json({ error: "Failed to retrieve profile" });
  }
});


// Increment profile views
app.post("/api/increment-profile-views", async (req, res) => {
  try {
    const { profileId } = req.body;
    await User.updateOne({ profileId }, { $inc: { profileViews: 1 } });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/update-profile", upload, async (req, res) => {
  const { profileId, updatedData: updatedDataString } = req.body;

  console.log("Received request:", { profileId, updatedDataString });

  if (!profileId || !updatedDataString) {
    console.log("Validation failed:", { profileId, updatedDataString });
    return res
      .status(400)
      .json({ error: "Profile ID and updated data are required" });
  }

  let updatedData;
  try {
    updatedData = JSON.parse(updatedDataString);
    console.log("Parsed updatedData:", JSON.stringify(updatedData, null, 2));
  } catch (error) {
    console.log("JSON parse error:", error.message);
    return res.status(400).json({ error: "Invalid updated data format" });
  }

  try {
    const updateFields = {};

    const fieldMappings = {
      "personalInfo.name": "personalInfo.name",
      "personalInfo.email": "personalInfo.email",
      "personalInfo.mobile": "personalInfo.mobile",
      "personalInfo.gender": "personalInfo.gender",
      "personalInfo.lookingFor": "personalInfo.lookingFor",
      "personalInfo.avatar": "personalInfo.avatar",
      "personalInfo.profileComplete": "personalInfo.profileComplete",
      "personalInfo.document": "personalInfo.document",
      "personalInfo.profileImage": "personalInfo.profileImage",
      "personalInfo.Status": "personalInfo.Status",
      "demographics.dateOfBirth": "demographics.dateOfBirth",
      "demographics.height": "demographics.height",
      "demographics.maritalStatus": "demographics.maritalStatus",
      "demographics.religion": "demographics.religion",
      "demographics.community": "demographics.community",
      "demographics.motherTongue": "demographics.motherTongue",
      "demographics.timeOfBirth": "demographics.timeOfBirth",
      "demographics.placeOfBirth": "demographics.placeOfBirth",
      "demographics.chartStyle": "demographics.chartStyle",
      "professionalInfo.education": "professionalInfo.education",
      "professionalInfo.fieldOfStudy": "professionalInfo.fieldOfStudy",
      "professionalInfo.occupation": "professionalInfo.occupation",
      "professionalInfo.income": "professionalInfo.income",
      "location.city": "location.city",
      "location.state": "location.state",
      "familyInfo.father": "familyInfo.father",
      "familyInfo.mother": "familyInfo.mother",
      familyTree: "familyTree",
      hobbies: "hobbies",
      horoscope: "horoscope",
      subscription: "subscription",
      profileCreatedAt: "profileCreatedAt",
      appVersion: "appVersion",
    };

    Object.keys(updatedData).forEach((key) => {
      if (key === "personalInfo") {
        Object.keys(updatedData.personalInfo).forEach((subKey) => {
          const mappedKey = `personalInfo.${subKey}`;
          if (fieldMappings[mappedKey]) {
            updateFields[fieldMappings[mappedKey]] =
              updatedData.personalInfo[subKey];
            console.log(
              `Mapping ${mappedKey} to ${
                updateFields[fieldMappings[mappedKey]]
              }`
            );
          } else {
            console.log(`No mapping for personalInfo.${subKey}`);
          }
        });
      } else if (key === "demographics") {
        Object.keys(updatedData.demographics).forEach((subKey) => {
          const mappedKey = `demographics.${subKey}`;
          if (fieldMappings[mappedKey]) {
            updateFields[fieldMappings[mappedKey]] =
              updatedData.demographics[subKey];
            console.log(
              `Mapping ${mappedKey} to ${
                updateFields[fieldMappings[mappedKey]]
              }`
            );
          } else {
            console.log(`No mapping for demographics.${subKey}`);
          }
        });
      } else if (key === "professionalInfo") {
        Object.keys(updatedData.professionalInfo).forEach((subKey) => {
          const mappedKey = `professionalInfo.${subKey}`;
          if (fieldMappings[mappedKey]) {
            updateFields[fieldMappings[mappedKey]] =
              updatedData.professionalInfo[subKey];
            console.log(
              `Mapping ${mappedKey} to ${
                updateFields[fieldMappings[mappedKey]]
              }`
            );
          } else {
            console.log(`No mapping for professionalInfo.${subKey}`);
          }
        });
      } else if (key === "location") {
        const { city, state } = updatedData.location;
        if (city) {
          updateFields["location.city"] = city;
          console.log(`Mapping location.city to ${city}`);
        }
        if (state) {
          updateFields["location.state"] = state;
          console.log(`Mapping location.state to ${state}`);
        }
      } else if (key === "familyInfo") {
        if (updatedData.familyInfo.father !== undefined) {
          updateFields["familyInfo.father"] =
            updatedData.familyInfo.father || "Not specified";
          console.log(
            `Mapping familyInfo.father to ${updatedData.familyInfo.father}`
          );
        }
        if (updatedData.familyInfo.mother !== undefined) {
          updateFields["familyInfo.mother"] =
            updatedData.familyInfo.mother || "Not specified";
          console.log(
            `Mapping familyInfo.mother to ${updatedData.familyInfo.mother}`
          );
        }
      } else if (key === "familyTree") {
        updateFields["familyTree"] = updatedData.familyTree || [];
        console.log(
          `Mapping familyTree to ${JSON.stringify(updatedData.familyTree)}`
        );
      } else if (key === "horoscope") {
        updateFields["horoscope"] = {
          generated: updatedData.horoscope.generated || false,
          compatibility: updatedData.horoscope.compatibility || "",
          luckyNumbers: updatedData.horoscope.luckyNumbers || [],
          luckyColors: updatedData.horoscope.luckyColors || [],
          favorableTime: updatedData.horoscope.favorableTime || "",
          message: updatedData.horoscope.message || "",
        };
        console.log(
          `Mapping horoscope to ${JSON.stringify(updateFields["horoscope"])}`
        );
      } else if (key === "hobbies") {
        updateFields["hobbies"] = updatedData.hobbies || "Not specified";
        console.log(`Mapping hobbies to ${updatedData.hobbies}`);
      } else if (fieldMappings[key]) {
        updateFields[fieldMappings[key]] = updatedData[key];
        console.log(`Mapping ${key} to ${updateFields[fieldMappings[key]]}`);
      } else {
        console.log(`No mapping found for key: ${key}`);
      }
    });

    if (req.files && req.files.profileImage) {
      updateFields[
        "personalInfo.profileImage"
      ] = `/Uploads/avatars/${req.files.profileImage[0].filename}`;
      updateFields[
        "personalInfo.avatar"
      ] = `/Uploads/avatars/${req.files.profileImage[0].filename}`;
      console.log(
        `Updating profileImage and avatar to: ${updateFields["personalInfo.profileImage"]}`
      );
    }

    if (req.files && req.files.document) {
      updateFields[
        "personalInfo.document"
      ] = `/Uploads/documents/${req.files.document[0].filename}`;
      console.log(
        `Updating document to: ${updateFields["personalInfo.document"]}`
      );
    }

    if (!updateFields["personalInfo.name"] && !updatedData.personalInfo?.name) {
      console.log(
        `Validation failed for profileId ${profileId}: Name is required`
      );
      return res.status(400).json({ error: "Name is required" });
    }

    // Validate email format if provided
    if (updateFields["personalInfo.email"]) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updateFields["personalInfo.email"])) {
        console.log(
          `Validation failed for profileId ${profileId}: Invalid email format`
        );
        return res.status(400).json({ error: "Invalid email format" });
      }
      const existingUser = await User.findOne({
        "personalInfo.email": updateFields["personalInfo.email"],
        profileId: { $ne: profileId },
      });
      if (existingUser) {
        console.log(
          `Validation failed for profileId ${profileId}: Email already in use`
        );
        return res.status(400).json({ error: "Email already in use" });
      }
    }

    console.log("Final updateFields:", JSON.stringify(updateFields, null, 2));

    // Fetch current user data to store in profileHistory
    const currentUser = await User.findOne({ profileId });
    if (currentUser) {
      currentUser.profileHistory = currentUser.profileHistory || [];
      currentUser.profileHistory.push({
        updatedAt: new Date(),
        data: {
          personalInfo: currentUser.personalInfo,
          demographics: currentUser.demographics,
          professionalInfo: currentUser.professionalInfo,
          location: currentUser.location,
          familyInfo: currentUser.familyInfo,
          familyTree: currentUser.familyTree,
          hobbies: currentUser.hobbies,
          horoscope: currentUser.horoscope,
          subscription: currentUser.subscription,
          profileCreatedAt: currentUser.profileCreatedAt,
          appVersion: currentUser.appVersion,
        },
      });
      await currentUser.save();
    } else {
      console.log(`Profile not found for profileId ${profileId}`);
      return res.status(404).json({ error: "Profile not found" });
    }

    // Update the user profile
    const updatedUser = await User.findOneAndUpdate(
      { profileId },
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      console.log(`Profile not found for profileId ${profileId}`);
      return res.status(404).json({ error: "Profile not found" });
    }

    const responseUser = {
      profileId: updatedUser.profileId,
      personalInfo: updatedUser.personalInfo,
      demographics: updatedUser.demographics,
      professionalInfo: updatedUser.professionalInfo,
      location: updatedUser.location,
      familyInfo: updatedUser.familyInfo,
      familyTree: updatedUser.familyTree,
      hobbies: updatedUser.hobbies,
      horoscope: updatedUser.horoscope,
      subscription: updatedUser.subscription,
      profileCreatedAt: updatedUser.profileCreatedAt,
      appVersion: updatedUser.appVersion,
    };

    console.log(`Profile updated for ${profileId}`);
    res.status(200).json({
      message: "Profile updated successfully",
      user: responseUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error.message);
    if (error.name === "ValidationError") {
      console.log("Validation errors:", JSON.stringify(error.errors, null, 2));
      return res
        .status(400)
        .json({ error: "Validation failed", details: error.errors });
    }
    res
      .status(500)
      .json({ error: "Failed to update profile", details: error.message });
  }
});

app.post("/api/send-interest", async (req, res) => {
  const { userProfileId, interestedProfileId } = req.body;
  if (!userProfileId || !interestedProfileId) {
    console.warn(
      `Missing userProfileId or interestedProfileId: ${JSON.stringify(
        req.body
      )}`
    );
    return res
      .status(400)
      .json({ error: "userProfileId and interestedProfileId are required" });
  }
  try {
    const interestedUser = await User.findOne({
      profileId: interestedProfileId,
    });
    if (!interestedUser) {
      console.warn(
        `Profile not found: interestedProfileId=${interestedProfileId}`
      );
      return res.status(404).json({ error: "Interested profile not found" });
    }
    const result = await Interest.findOneAndUpdate(
      { userProfileId },
      {
        $addToSet: {
          interestedProfiles: { profileId: interestedProfileId },
        },
      },
      { upsert: true, new: true }
    );
    console.log(
      `Interest stored: userProfileId=${userProfileId}, interestedProfileId=${interestedProfileId}`
    );
    res.status(200).json({ message: "Interest sent successfully" });
  } catch (error) {
    console.error("Error storing interest:", error.message);
    res.status(500).json({ error: "Failed to send interest" });
  }
});

app.get("/api/interested-profiles", async (req, res) => {
  const { userProfileId } = req.query;
  if (!userProfileId) {
    console.warn("Missing userProfileId in query");
    return res.status(400).json({ error: "userProfileId is required" });
  }
  try {
    const interestDoc = await Interest.findOne({ userProfileId });
    if (!interestDoc || !interestDoc.interestedProfiles.length) {
      return res.status(200).json([]);
    }
    const interestedProfileIds = interestDoc.interestedProfiles.map(
      (entry) => entry.profileId
    );
    const users = await User.find({
      profileId: { $in: interestedProfileIds },
      "otp.verified": true,
    }).select(
      "profileId personalInfo.name personalInfo.profileImage demographics.dateOfBirth professionalInfo.occupation location.city professionalInfo.education demographics.community professionalInfo.income demographics.horoscope image"
    );
    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
    const profiles = users.map((user) => {
      const age =
        new Date().getFullYear() -
        new Date(user.demographics.dateOfBirth).getFullYear();
      
      // Construct image URL (same logic as /api/profiles)
      let image = "https://via.placeholder.com/150"; // Default placeholder
      if (user.personalInfo?.profileImage) {
        if (user.personalInfo.profileImage.startsWith("http")) {
          image = user.personalInfo.profileImage; // Already a full URL
        } else {
          // Prepend BASE_URL and ensure single forward slash
          const cleanPath = user.personalInfo.profileImage.startsWith("/")
            ? user.personalInfo.profileImage.slice(1)
            : user.personalInfo.profileImage;
          image = `${BASE_URL}/${cleanPath}`;
        }
      }
      return {
        id: user.profileId,
        name: user.personalInfo.name,
        age: age,
        profession: user.professionalInfo.occupation,
        location: user.location.city,
        education: user.professionalInfo.education,
        community: user.demographics.community,
        income: user.professionalInfo.income,
        horoscope: user.demographics.horoscope || false,
        image,
      };
    });
    console.log(
      `Fetched ${profiles.length} interested profiles for userProfileId=${userProfileId}`
    );
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Error fetching interested profiles:", error.message);
    res.status(500).json({ error: "Failed to fetch interested profiles" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unexpected error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.delete("/api/remove-interest", async (req, res) => {
  const { userProfileId, interestedProfileId } = req.body;
  if (!userProfileId || !interestedProfileId) {
    console.warn(
      `Missing userProfileId or interestedProfileId: ${JSON.stringify(
        req.body
      )}`
    );
    return res
      .status(400)
      .json({ error: "userProfileId and interestedProfileId are required" });
  }
  try {
    const result = await Interest.updateOne(
      { userProfileId },
      { $pull: { interestedProfiles: { profileId: interestedProfileId } } }
    );
    if (result.modifiedCount === 0) {
      console.warn(
        `No interest found to delete: userProfileId=${userProfileId}, interestedProfileId=${interestedProfileId}`
      );
      return res.status(404).json({ error: "Interest not found" });
    }
    console.log(
      `Interest removed: userProfileId=${userProfileId}, interestedProfileId=${interestedProfileId}`
    );
    res.status(200).json({ message: "Interest removed successfully" });
  } catch (error) {
    console.error("Error removing interest:", error.message);
    res.status(500).json({ error: "Failed to remove interest" });
  }
});

app.delete("/api/remove-all-interests", async (req, res) => {
  const { userProfileId } = req.body;
  if (!userProfileId) {
    console.warn(`Missing userProfileId: ${JSON.stringify(req.body)}`);
    return res.status(400).json({ error: "userProfileId is required" });
  }
  try {
    const result = await Interest.updateOne(
      { userProfileId },
      { $set: { interestedProfiles: [] } }
    );
    console.log(`Removed all interests for userProfileId=${userProfileId}`);
    res.status(200).json({
      message: "All interests removed successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error removing all interests:", error.message);
    res.status(500).json({ error: "Failed to remove all interests" });
  }
});

app.get("/api/profiles/:id", async (req, res) => {
  try {
    const profileId = req.params.id;
    const user = await User.findOne({ profileId });
    if (!user) {
      return res.status(404).json({ error: "Profile not found" });
    }
    let age = "N/A";
    try {
      const dob = new Date(user.demographics.dateOfBirth);
      if (!isNaN(dob.getTime())) {
        age = Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000));
      }
    } catch (error) {
      console.error(`Invalid dateOfBirth for user ${user.profileId}:`, error);
    }
    const profile = {
      id: user.profileId,
      name: user.personalInfo.name || "Unknown",
      age,
      profession: user.professionalInfo.occupation || "Unknown",
      location: `${user.location.city}, ${user.location.state}` || "Unknown",
      education: user.professionalInfo.education || "Unknown",
      salary: user.professionalInfo.income || "Not specified",
      height: user.demographics.height || "Unknown",
      community: user.demographics.community || "Unknown",
      motherTongue: user.demographics.motherTongue || "Unknown",
      caste: user.demographics.community || "Not specified",
      religion: user.demographics.religion || "Not specified",
      dateOfBirth: user.demographics.dateOfBirth || "Not specified",
      placeOfBirth: user.demographics.placeOfBirth || "Not specified",
      hobbies: user.hobbies || "Not specified",
      images: user.personalInfo.profileImage
        ? [user.personalInfo.profileImage]
        : ["https://via.placeholder.com/300"],
      family: {
        father: user.familyInfo.father || "Not specified",
        mother: user.familyInfo.mother || "Not specified",
        siblings: user.familyInfo.siblings || "None",
      },
    };
    res.status(200).json(profile);
  } catch (error) {
    console.error("Error fetching profile:", error.message);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// New endpoint: POST /api/pass-profile
app.post("/api/pass-profile", async (req, res) => {
  const { userProfileId, passedProfileId } = req.body;
  if (!userProfileId || !passedProfileId) {
    console.warn(
      `Missing userProfileId or passedProfileId: ${JSON.stringify(req.body)}`
    );
    return res
      .status(400)
      .json({ error: "userProfileId and passedProfileId are required" });
  }
  try {
    const passedUser = await User.findOne({ profileId: passedProfileId });
    if (!passedUser) {
      console.warn(`Profile not found: passedProfileId=${passedProfileId}`);
      return res.status(404).json({ error: "Passed profile not found" });
    }
    const result = await Interest.findOneAndUpdate(
      { userProfileId },
      {
        $addToSet: {
          passedProfiles: { profileId: passedProfileId },
        },
      },
      { upsert: true, new: true }
    );
    console.log(
      `Pass stored: userProfileId=${userProfileId}, passedProfileId=${passedProfileId}`
    );
    res.status(200).json({ message: "Profile passed successfully" });
  } catch (error) {
    console.error("Error storing pass:", error.message);
    res.status(500).json({ error: "Failed to pass profile" });
  }
});

// New endpoint: GET /api/passed-profiles
app.get("/api/passed-profiles", async (req, res) => {
  const { userProfileId } = req.query;
  if (!userProfileId) {
    console.warn("Missing userProfileId in query");
    return res.status(400).json({ error: "userProfileId is required" });
  }
  try {
    const interestDoc = await Interest.findOne({ userProfileId });
    if (!interestDoc || !interestDoc.passedProfiles?.length) {
      return res.status(200).json([]);
    }
    const passedProfileIds = interestDoc.passedProfiles.map(
      (entry) => entry.profileId
    );
    const users = await User.find({
      profileId: { $in: passedProfileIds },
      "otp.verified": true,
    }).select(
      "profileId personalInfo.name demographics.dateOfBirth professionalInfo.occupation location.city professionalInfo.education demographics.community professionalInfo.income demographics.horoscope image"
    );
    const profiles = users.map((user) => {
      const age =
        new Date().getFullYear() -
        new Date(user.demographics.dateOfBirth).getFullYear();
      return {
        id: user.profileId,
        name: user.personalInfo.name,
        age: age,
        profession: user.professionalInfo.occupation,
        location: user.location.city,
        education: user.professionalInfo.education,
        community: user.demographics.community,
        income: user.professionalInfo.income,
        horoscope: user.demographics.horoscope || false,
        image:
          user.image ||
          "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80",
      };
    });
    console.log(
      `Fetched ${profiles.length} passed profiles for userProfileId=${userProfileId}`
    );
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Error fetching passed profiles:", error.message);
    res.status(500).json({ error: "Failed to fetch passed profiles" });
  }
});

// GET recent matches
app.get("/api/recent-matches", async (req, res) => {
  try {
    const { profileId, gender } = req.query;
    if (!profileId || !gender) {
      return res
        .status(400)
        .json({ error: "profileId and gender are required" });
    }
    const targetGender = gender.toLowerCase() === "male" ? "female" : "male";
    console.log(`Target gender: ${targetGender}`);

    const query = {
      profileId: { $ne: profileId },
      "personalInfo.gender": targetGender,
      "otp.verified": true, // Only return verified users
    };
    console.log(`Query: ${JSON.stringify(query)}`);

    const matches = await User.find(query)
      .select(
        "profileId personalInfo.name demographics.dateOfBirth professionalInfo.occupation location.city location.state personalInfo.profileImage"
      )
      .sort({ profileCreatedAt: -1 })
      .limit(3);

    console.log(`Found matches: ${matches.length}`);

    const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
    const formattedMatches = matches.map((profile) => {
      let age = "Not specified";
      if (profile.demographics.dateOfBirth) {
        try {
          const dob = new Date(profile.demographics.dateOfBirth);
          if (!isNaN(dob.getTime())) {
            const today = new Date();
            age = Math.floor((today - dob) / (1000 * 60 * 60 * 24 * 365));
            if (age < 0 || age > 120) age = "Not specified";
          }
        } catch (error) {
          console.error(`Invalid dateOfBirth for user ${profile.profileId}:`, error.message);
        }
      }

      // Construct image URL
      let image = 'https://via.placeholder.com/150'; // Consistent placeholder
      if (profile.personalInfo?.profileImage) {
        if (profile.personalInfo.profileImage.startsWith('http')) {
          image = profile.personalInfo.profileImage; // Already a full URL
        } else {
          const cleanPath = profile.personalInfo.profileImage.startsWith('/')
            ? profile.personalInfo.profileImage.slice(1)
            : profile.personalInfo.profileImage;
          image = `${BASE_URL}/${cleanPath}`;
        }
      }

      return {
        id: profile.profileId,
        name: profile.personalInfo.name || "Not specified",
        age,
        profession: profile.professionalInfo.occupation || "Not specified",
        location: profile.location.city && profile.location.state
          ? `${profile.location.city}, ${profile.location.state}`
          : "Not specified",
        image,
      };
    });

    res.status(200).json({ matches: formattedMatches });
  } catch (error) {
    console.error("Error fetching recent matches:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET profile by ID
app.get("/api/profiles/:id", async (req, res) => {
  try {
    const profileId = req.params.id;
    const user = await User.findOne({ profileId, "otp.verified": true }).select(
      "profileId personalInfo.name personalInfo.profileImage demographics.dateOfBirth professionalInfo.occupation location.city location.state professionalInfo.education professionalInfo.income demographics.height demographics.community demographics.motherTongue demographics.religion personalInfo.hobbiesAndInterests personalInfo.about family preferences"
    );

    if (!user) {
      return res.status(404).json({ error: "Profile not found" });
    }

    let age = "N/A";

    try {
      const dob = new Date(user.demographics.dateOfBirth);
      if (!isNaN(dob.getTime())) {
        age = Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000));
      }
    } catch (error) {
      console.error(`Invalid dateOfBirth for user ${user.profileId}:`, error);
    }

    // Construct image URL
    const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
    let images = ['https://via.placeholder.com/150']; // Consistent with /api/profiles
    if (user.personalInfo?.profileImage) {
      if (user.personalInfo.profileImage.startsWith('http')) {
        images = [user.personalInfo.profileImage]; // Already a full URL
      } else {
        const cleanPath = user.personalInfo.profileImage.startsWith('/')
          ? user.personalInfo.profileImage.slice(1)
          : user.personalInfo.profileImage;
        images = [`${BASE_URL}/${cleanPath}`];
      }
    }

    const profile = {
      id: user.profileId,
      name: user.personalInfo.name || "Unknown",
      age,
      profession: user.professionalInfo.occupation || "Unknown",
      location: `${user.location.city}, ${user.location.state}` || "Unknown",
      education: user.professionalInfo.education || "Unknown",
      salary: user.professionalInfo.income || "Not specified",
      height: user.demographics.height || "Unknown",
      community: user.demographics.community || "Unknown",
      motherTongue: user.demographics.motherTongue || "Unknown",
      images,
      about: user.personalInfo.about || "No description provided.",
      family: {
        father: user.family?.father || "Not specified",
        mother: user.family?.mother || "Not specified",
        siblings: user.family?.siblings || "None",
      },
      preferences: user.preferences || [
        "Age: Not specified",
        "Education: Not specified",
        "Profession: Not specified",
        "Location: Not specified",
      ],
    };

    res.status(200).json(profile);
  } catch (error) {
    console.error("Error fetching profile:", error.message);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// app.post('/api/create-profile', async (req, res) => {
//   const profileData = req.body;

//   console.log('Received profile data:', profileData);

//   // Validate required fields
//   const requiredFields = [
//     'personalInfo.email',
//     'personalInfo.name',
//     'personalInfo.mobile',
//     'personalInfo.gender',
//     'personalInfo.lookingFor',
//     'demographics.dateOfBirth',
//     'demographics.height',
//     'demographics.maritalStatus',
//     'demographics.religion',
//     'demographics.community',
//     'demographics.motherTongue',
//     'professionalInfo.education',
//     'professionalInfo.occupation',
//     'professionalInfo.income',
//     'location.city',
//     'location.state',
//     'credentials.password',
//     'appVersion',
//   ];

//   const missingFields = requiredFields.filter((field) => {
//     if (field.includes('.')) {
//       const [section, key] = field.split('.');
//       return !profileData[section] || !profileData[section][key];
//     } else {
//       return !profileData[field];
//     }
//   });

//   if (missingFields.length > 0) {
//     console.warn('Missing required fields:', missingFields);
//     return res
//       .status(400)
//       .json({ error: 'Missing required fields', missingFields });
//   }

//   try {
//     const normalizedEmail = profileData.personalInfo.email.toLowerCase();
//     const existingUser = await User.findOne({
//       'personalInfo.email': normalizedEmail,
//     });

//     const hashedPassword = await bcrypt.hash(
//       profileData.credentials.password,
//       10
//     );

//     if (existingUser) {
//       if (!existingUser.otp?.verified) {
//         console.warn(`Email not verified for ${normalizedEmail}`);
//         return res.status(400).json({ error: 'Email not verified' });
//       }

//       // Preserve existing subscription history
//       const updatedSubscription = {
//         current:
//           profileData.subscription?.current ||
//           existingUser.subscription?.current ||
//           'free',
//         details:
//           profileData.subscription?.details ||
//           existingUser.subscription?.details ||
//           {},
//         history: existingUser.subscription?.history || [],
//       };

//       await User.updateOne(
//         { 'personalInfo.email': normalizedEmail },
//         {
//           $set: {
//             profileId: existingUser.profileId || `KM${Date.now()}`,
//             personalInfo: {
//               ...profileData.personalInfo,
//               email: normalizedEmail,
//             },
//             demographics: profileData.demographics,
//             professionalInfo: profileData.professionalInfo,
//             location: profileData.location,
//             credentials: {
//               ...profileData.credentials,
//               password: hashedPassword,
//             },
//             subscription: updatedSubscription,
//             profileCreatedAt: new Date(),
//             appVersion: profileData.appVersion,
//           },
//         }
//       );

//       console.log('Profile updated:', {
//         profileId: existingUser.profileId,
//         email: normalizedEmail,
//         subscription: updatedSubscription.current,
//       });

//       return res.status(201).json({
//         message: 'Profile updated successfully',
//         profileId: existingUser.profileId,
//         email: normalizedEmail,
//         subscription: updatedSubscription.current,
//       });
//     } else {
//       // Create new user
//       const newUser = new User({
//         ...profileData,
//         personalInfo: { ...profileData.personalInfo, email: normalizedEmail },
//         credentials: { ...profileData.credentials, password: hashedPassword },
//         subscription: {
//           current: profileData.subscription?.current || 'free',
//           details: profileData.subscription?.details || {},
//           history: [],
//         },
//         profileCreatedAt: new Date(),
//       });

//       await newUser.save();

//       console.log('Profile created:', {
//         profileId: newUser.profileId,
//         email: newUser.personalInfo.email,
//         subscription: newUser.subscription.current,
//       });

//       return res.status(201).json({
//         message: 'Profile created successfully',
//         profileId: newUser.profileId,
//         email: newUser.personalInfo.email,
//         subscription: newUser.subscription.current,
//       });
//     }
//   } catch (error) {
//     console.error('Error creating profile:', error.message);
//     if (error.code === 11000) {
//       return res.status(400).json({ error: 'Email already exists' });
//     }
//     return res
//       .status(500)
//       .json({ error: `Failed to create profile: ${error.message}` });
//   }
// });

// New endpoint: GET /api/user/stats
// New endpoint: GET /api/user/stats
app.get("/api/user/stats", async (req, res) => {
  try {
    const { profileId } = req.query;
    if (!profileId) {
      console.warn("Missing profileId in query");
      return res.status(400).json({ error: "profileId is required" });
    }

    // Fetch profile views
    const user = await User.findOne({ profileId }).select("profileViews");
    if (!user) {
      console.warn(`User not found for profileId: ${profileId}`);
      return res.status(404).json({ error: "User not found" });
    }
    const profileViews = user.profileViews || 0;

    // Fetch interests received
    const interests = await Interest.find({
      "interestedProfiles.profileId": profileId,
    });
    const interestsReceived = interests.length;

    // Fetch messages received
    const messages = await Message.find({ recipientProfileId: profileId });
    const messagesCount = messages.length;

    res.status(200).json({
      profileViews,
      interestsReceived,
      messages: messagesCount,
    });
  } catch (error) {
    console.error("Error fetching user stats:", error.message);
    res.status(500).json({ error: "Failed to fetch user stats" });
  }
});

//usermanangement

// Get all users
// Helper to check if a value is "filled"
function isFilled(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

// Get all users
app.get("/get/users", async (req, res) => {
  try {
    const users = await User.find();

    const formattedUsers = users.map((user, index) => {
      // Define fields for completion tracking
      const fieldsToCheck = [
        user.personalInfo.name,
        user.personalInfo.email,
        user.personalInfo.mobile,
        user.personalInfo.gender,
        user.personalInfo.lookingFor,
        user.personalInfo.hobbies,
        user.demographics.dateOfBirth,
        user.demographics.height,
        user.demographics.maritalStatus,
        user.demographics.religion,
        user.demographics.community,
        user.demographics.motherTongue,
        user.professionalInfo.education,
        user.professionalInfo.occupation,
        user.professionalInfo.income,
        user.subscription.current,
        user.location.city,
        user.location.state,
        user.familyInfo.father,
        user.familyInfo.mother,
        user.familyTree,
        user.horoscope.timeOfBirth,
        user.horoscope.placeOfBirth,
        user.horoscope.chartStyle,
      ];

      const totalFields = fieldsToCheck.length;
      const filledFields = fieldsToCheck.filter(isFilled).length;
      const profileComplete = Math.round((filledFields / totalFields) * 100);

      return {
        id: index + 1,
        _id: user._id,
        name: user.personalInfo.name,
        email: user.personalInfo.email,
        phone: user.personalInfo.mobile,
        verified: user.otp?.verified,
        joinDate: user.profileCreatedAt,
        role: user.personalInfo.role,
        status: user.personalInfo.Status,
        subscription: user.subscription.current,
        lastActive: user.lastActive,
        profileComplete: profileComplete,
      };
    });

    res.status(200).json(formattedUsers);
  } catch (error) {
    console.error("Error fetching users:", error.message);
    res.status(500).json({ error: `Failed to fetch users: ${error.message}` });
  }
});

// PUT /user/:id/status
app.put("/user/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { "personalInfo.Status": status },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Return exactly how frontend expects it
    res.status(200).json({
      _id: updatedUser._id.toString(),
      status: updatedUser.personalInfo.Status,
    });
  } catch (err) {
    console.error("Status update failed:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Update user data by ID
app.put("/update/user/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, phone, role, status } = req.body;
    console.log(role, status);

    // Find and update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          "personalInfo.name": name,
          "personalInfo.email": email,
          "personalInfo.mobile": phone,
          "personalInfo.role": role,
          "personalInfo.Status": status,
        },
      },
      { new: true } // return the updated document
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    res
      .status(200)
      .json({ message: "User updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Update error:", error.message);
    res.status(500).json({ error: "Server error while updating user" });
  }
});

// DELETE user by MongoDB _id
app.delete("/delete/user/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

///....................................admin dashbaoard.........................................................
// User count endpoint
app.get("/api/users/count", async (req, res) => {
  try {
    const count = await User.countDocuments({});
    console.log(`User count fetched: ${count}`);
    res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching user count:", error.message, error.stack);
    res.status(500).json({ error: "Failed to fetch user count" });
  }
});

// Recent logins endpoint
app.get("/api/users/recent-logins", async (req, res) => {
  try {
    console.log("Fetching recent logins from database...");
    const users = await User.find({})
      .sort({ lastLogin: -1, profileCreatedAt: -1 })
      .limit(5)
      .select(
        "personalInfo.name personalInfo.email personalInfo.mobile status otp.verified profileCreatedAt lastLogin role profileCompletion"
      );
    if (users.length === 0) {
      console.warn("No users found in database");
      const totalCount = await User.countDocuments({});
      console.log(`Total users in database: ${totalCount}`);
      if (totalCount > 0) {
        console.warn(
          "Mismatch: countDocuments reports users, but find query returned none"
        );
      }
    } else {
      console.log(
        `Found ${users.length} users:`,
        users.map((u) => ({
          _id: u._id,
          name: u.personalInfo?.name || "N/A",
          email: u.personalInfo?.email || "N/A",
          mobile: u.personalInfo?.mobile || "N/A",
          status: u.status || "N/A",
          lastLogin: u.lastLogin || "N/A",
          profileCreatedAt: u.profileCreatedAt || "N/A",
          role: u.role || "N/A",
          profileCompletion: u.profileCompletion || 0,
          verified: u.otp?.verified || false,
        }))
      );
    }
    const formattedUsers = users.map((user, index) => ({
      id: index + 1,
      name: user.personalInfo?.name || `User${index + 1}`,
      email: user.personalInfo?.email || `user${index + 1}@domain.com`,
      phone: user.personalInfo?.mobile || "N/A",
      status: user.status || "Active",
      verified: user.otp?.verified || false,
      joinDate: user.profileCreatedAt
        ? user.profileCreatedAt.toISOString().split("T")[0]
        : "2024-01-01",
      lastLogin: user.lastLogin
        ? user.lastLogin.toISOString().split("T")[0]
        : "N/A",
      role: user.role || "user",
      profileCompletion: user.profileCompletion || 50,
    }));
    console.log(
      `Returning ${formattedUsers.length} users for recent logins:`,
      formattedUsers
    );
    res.status(200).json({ users: formattedUsers });
  } catch (error) {
    console.error("Error fetching recent logins:", error.message, error.stack);
    res.status(500).json({ error: "Failed to fetch recent logins" });
  }
});

// ........//

// Profile endpoint (GET)// server.js (ensure this is included)
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    console.log("Fetching profile for userId:", req.user.userId);
    const user = await Admin.findById(req.user.userId).select("-password");
    if (!user) {
      console.log("Admin not found for userId:", req.user.userId);
      return res.status(404).json({ message: "Admin not found" });
    }
    console.log("Profile found:", user);
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        department: user.department,
        bio: user.bio,
        language: user.language,
        timezone: user.timezone,
        role: user.role,
        avatar: user.avatar || "/placeholder.svg",
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// Profile endpoint (PATCH)
app.patch(
  "/api/profile",
  authMiddleware,
  photoUpload,
  async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        location,
        department,
        bio,
        language,
        timezone,
      } = req.body;
      const updateData = {
        name,
        email,
        phone,
        location,
        department,
        bio,
        language,
        timezone,
        personalInfo: { email },
      };
      if (req.file) {
        updateData.avatar = `/uploads/avatars/${req.file.filename}`;
      }
      const user = await Admin.findByIdAndUpdate(
        req.user.userId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select("-password");
      if (!user) {
        return res.status(404).json({ message: "Admin not found" });
      }
      res.json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          location: user.location,
          department: user.department,
          bio: user.bio,
          language: user.language,
          timezone: user.timezone,
          role: user.role,
          avatar: user.avatar || "/placeholder.svg",
        },
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  }
);

// Change password endpoint
app.post("/api/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }
    const user = await Admin.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "Admin not found" });
    }
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isValidPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
});

// Profiles route
app.get("/api/profiles", authMiddleware, async (req, res) => {
  try {
    console.log("Profiles route accessed, user:", req.user);
    const users = await User.find({ role: "user" }).select(
      "profileId personalInfo.name personalInfo.email personalInfo.gender " +
        "demographics.dateOfBirth demographics.maritalStatus demographics.community " +
        "professionalInfo.education professionalInfo.occupation location.city location.state " +
        "profileStatus flagReasons photos lastActive profileCreatedAt subscription"
    );
    console.log(
      "Queried users with role: user, found:",
      users.length,
      "documents"
    );
    const profiles = users.map((user) => {
      console.log("Processing user:", user.profileId);
      return {
        id: user.profileId,
        name: user.personalInfo.name || "Unknown",
        age: calculateAge(user.demographics?.dateOfBirth),
        gender: user.personalInfo?.gender
          ? user.personalInfo.gender.toLowerCase()
          : "unknown",
        location:
          user.location?.city && user.location?.state
            ? `${user.location.city}, ${user.location.state}`
            : "Unknown",
        profession: user.professionalInfo?.occupation || "Unknown",
        community: user.demographics?.community || "Unknown",
        education: user.professionalInfo?.education || "Unknown",
        maritalStatus:
          user.demographics?.maritalStatus?.toLowerCase().replace(" ", "_") ||
          "never_married",
        profileStatus: user.profileStatus || "active",
        verified: user.otp?.verified || false,
        premium: user.subscription !== "free",
        photos: user.photos || 0,
        profileComplete: calculateProfileCompleteness(user),
        lastActive: user.lastActive
          ? user.lastActive.toISOString().split("T")[0]
          : "Unknown",
        joinDate: user.profileCreatedAt
          ? user.profileCreatedAt.toISOString().split("T")[0]
          : "Unknown",
        flagReasons: user.flagReasons || [],
      };
    });
    res.json(profiles);
  } catch (error) {
    console.error("Error fetching profiles:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch profiles", error: error.message });
  }
});

// Profile flag endpoint
app.patch("/api/profiles/:profileId/flag", async (req, res) => {
  try {
    const { profileId } = req.params;
    const { reason } = req.body;
    const user = await User.findOneAndUpdate(
      { profileId },
      { profileStatus: "flagged", $push: { flagReasons: reason } },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json({ message: "Profile flagged successfully" });
  } catch (error) {
    console.error("Error flagging profile:", error);
    res.status(500).json({ message: "Failed to flag profile" });
  }
});

// Profile unflag endpoint
app.patch(
  "/api/profiles/:profileId/unflag",
  authMiddleware,
  async (req, res) => {
    try {
      const { profileId } = req.params;
      const user = await User.findOneAndUpdate(
        { profileId },
        { profileStatus: "active", flagReasons: [] },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json({ message: "Profile unflagged successfully" });
    } catch (error) {
      console.error("Error unflagging profile:", error);
      res.status(500).json({ message: "Failed to unflag profile" });
    }
  }
);

// Profile verify endpoint
app.patch(
  "/api/profiles/:profileId/verify",
  authMiddleware,
  async (req, res) => {
    try {
      const { profileId } = req.params;
      const user = await User.findOneAndUpdate(
        { profileId },
        { "otp.verified": true },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json({ message: "Profile verified successfully" });
    } catch (error) {
      console.error("Error verifying profile:", error);
      res.status(500).json({ message: "Failed to verify profile" });
    }
  }
);

// Placeholder for calculateAge and calculateProfileCompleteness
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return 0;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function calculateProfileCompleteness(user) {
  let completeness = 0;
  if (user.personalInfo?.name) completeness += 20;
  if (user.personalInfo?.gender) completeness += 10;
  if (user.demographics?.dateOfBirth) completeness += 10;
  if (user.demographics?.maritalStatus) completeness += 10;
  if (user.demographics?.community) completeness += 10;
  if (user.professionalInfo?.education) completeness += 10;
  if (user.professionalInfo?.occupation) completeness += 10;
  if (user.location?.city && user.location?.state) completeness += 10;
  if (user.photos > 0) completeness += 10;
  if (user.otp?.verified) completeness += 10;
  return completeness;
}

// Success Stories Endpoints
app.post("/api/stories", storyUpload, async (req, res) => {
  try {
    const { names, weddingDate, location, email, story, imageUrl } = req.body;

    // Validate required fields
    if (!names || !weddingDate || !location || !email || !story) {
      return res
        .status(400)
        .json({ error: "All required fields must be provided" });
    }

    // Determine image path
    let imagePath = null;
    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`;
    } else if (imageUrl && imageUrl.trim() !== "") {
      imagePath = imageUrl.trim();
    }

    if (!imagePath) {
      return res
        .status(400)
        .json({ error: "Image URL or file upload is required" });
    }

    // Create and save the story
    const newStory = new Story({
      names,
      weddingDate,
      location,
      email,
      story,
      image: imagePath,
    });

    await newStory.save();

    res.status(201).json({
      message: "Story saved successfully",
      story: newStory,
    });
  } catch (error) {
    console.error("Error saving story:", error); // log full error
    res.status(500).json({ error: error.message || "Failed to save story" });
  }
});

app.get("/api/stories", async (req, res) => {
  try {
    const stories = await Story.find().sort({ createdAt: -1 });
    res.status(200).json(stories);
  } catch (error) {
    console.error("Error fetching stories:", error.message);
    res.status(500).json({ error: "Failed to fetch stories" });
  }
});



app.get("/api/messages", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    }).sort({ createdAt: 1 });

    const formattedMessages = messages.map((msg) => ({
      id: msg._id.toString(),
      text: msg.text,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      time: msg.time,
      edited: msg.edited || false,
    }));

    res.status(200).json({ messages: formattedMessages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Add chat contact
app.post("/api/add-chat-contact", async (req, res) => {
  try {
    const { profileId, contactId } = req.body;
    if (!profileId || !contactId) {
      return res
        .status(400)
        .json({ error: "profileId and contactId are required" });
    }
    await User.updateOne(
      { profileId },
      { $addToSet: { chatContacts: contactId } } // Add if not present
    );
    res.status(200).json({ message: "Chat contact added" });
  } catch (error) {
    console.error("Error adding chat contact:", error);
    res.status(500).json({ error: "Failed to add chat contact" });
  }
});

// Get chat contacts
app.get("/api/chat-contacts", async (req, res) => {
  try {
    const { profileId } = req.query;
    if (!profileId) {
      return res.status(400).json({ error: "profileId is required" });
    }
    const user = await User.findOne({ profileId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const contacts = await User.find({
      profileId: { $in: user.chatContacts },
    }).select("profileId personalInfo.name personalInfo.profileImage");
    const formattedContacts = contacts.map((c) => ({
      id: c.profileId,
      name: c.personalInfo.name || "Unknown",
      avatar: c.personalInfo.profileImage || "https://via.placeholder.com/100",
      online: false, // Updated via Socket.IO in frontend
    }));
    res.status(200).json({ contacts: formattedContacts });
  } catch (error) {
    console.error("Error fetching chat contacts:", error);
    res.status(500).json({ error: "Failed to fetch chat contacts" });
  }
});

app.get("/api/received-interests", async (req, res) => {
  const { userProfileId } = req.query;
  if (!userProfileId) {
    console.warn("Missing userProfileId in query");
    return res.status(400).json({ error: "userProfileId is required" });
  }
  try {
    const interestDocs = await Interest.find({
      "interestedProfiles.profileId": userProfileId,
    });
    const senderProfileIds = interestDocs.map((doc) => doc.userProfileId);
    if (!senderProfileIds.length) {
      return res.status(200).json([]);
    }
    const users = await User.find({
      profileId: { $in: senderProfileIds },
      "otp.verified": true,
    }).select(
      "profileId personalInfo.name personalInfo.profileImage demographics.dateOfBirth professionalInfo.occupation location.city professionalInfo.education demographics.community professionalInfo.income demographics.horoscope image"
    );
    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
    const profiles = users.map((user) => {
      const age =
        new Date().getFullYear() -
        new Date(user.demographics.dateOfBirth).getFullYear();
      let image = "https://via.placeholder.com/150";
      if (user.personalInfo?.profileImage) {
        if (user.personalInfo.profileImage.startsWith("http")) {
          image = user.personalInfo.profileImage;
        } else {
          const cleanPath = user.personalInfo.profileImage.startsWith("/")
            ? user.personalInfo.profileImage.slice(1)
            : user.personalInfo.profileImage;
          image = `${BASE_URL}/${cleanPath}`;
        }
      }
      return {
        id: user.profileId,
        name: user.personalInfo.name,
        age: age,
        profession: user.professionalInfo.occupation,
        location: user.location.city,
        education: user.professionalInfo.education,
        community: user.demographics.community,
        income: user.professionalInfo.income,
        horoscope: user.demographics.horoscope || false,
        image,
      };
    });
    console.log(
      `Fetched ${profiles.length} received interest profiles for userProfileId=${userProfileId}`
    );
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Error fetching received interests:", error.message);
    res.status(500).json({ error: "Failed to fetch received interests" });
  }
});

// Socket.IO setup

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  console.log(
    `Socket.IO connection established for userId: ${userId}, socketId: ${socket.id}`
  );
  if (userId) {
    onlineUsers.set(userId, socket.id);
    io.emit("onlineUsers", Array.from(onlineUsers.keys()));
  }

  socket.on("sendMessage", async (message) => {
    try {
      console.log("Received message:", message);
      // Add bidirectional chat contacts
      await User.updateOne(
        { profileId: message.senderId },
        { $addToSet: { chatContacts: message.receiverId } }
      );
      await User.updateOne(
        { profileId: message.receiverId },
        { $addToSet: { chatContacts: message.senderId } }
      );

      const newMessage = new Message({
        senderId: message.senderId,
        receiverId: message.receiverId,
        text: message.text,
        time: message.time,
      });
      await newMessage.save();

      const receiverSocketId = onlineUsers.get(message.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("receiveMessage", message);
        console.log(
          `Message sent to receiverId: ${message.receiverId}, socketId: ${receiverSocketId}`
        );
      }
      io.to(onlineUsers.get(message.senderId)).emit("receiveMessage", message);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  socket.on("editMessage", async ({ messageId, newText }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return;

      message.text = newText;
      message.edited = true;
      await message.save();

      const updatedMessage = {
        id: message._id.toString(),
        text: message.text,
        senderId: message.senderId,
        receiverId: message.receiverId,
        time: message.time,
        edited: true,
      };

      const senderSocketId = onlineUsers.get(message.senderId);
      const receiverSocketId = onlineUsers.get(message.receiverId);

      if (senderSocketId)
        io.to(senderSocketId).emit("messageEdited", updatedMessage);
      if (receiverSocketId)
        io.to(receiverSocketId).emit("messageEdited", updatedMessage);
    } catch (error) {
      console.error("Error editing message:", error);
    }
  });

  socket.on("deleteMessage", async (messageId) => {
    try {
      const message = await Message.findByIdAndDelete(messageId);
      if (!message) return;

      const senderSocketId = onlineUsers.get(message.senderId);
      const receiverSocketId = onlineUsers.get(message.receiverId);

      if (senderSocketId)
        io.to(senderSocketId).emit("messageDeleted", messageId);
      if (receiverSocketId)
        io.to(receiverSocketId).emit("messageDeleted", messageId);
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  });

  socket.on("disconnect", () => {
    if (userId) {
      onlineUsers.delete(userId);
      io.emit("onlineUsers", Array.from(onlineUsers.keys()));
      console.log(`User disconnected: ${userId}`);
    }
  });
});


//preethi

// Religion Schema
const religionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
});
const Religion = mongoose.model('Religion', religionSchema);

// Community Schema
const communitySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  religion: { type: String }, // Optional: Link to a religion
});
const Community = mongoose.model('Community', communitySchema);

// Seed initial data if collections are empty
async function seedData() {
  const religionCount = await Religion.countDocuments();
  if (religionCount === 0) {
    const initialReligions = [
      'Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Parsi', 'Jewish', 'Inter-Religion', 'No Religion', 'Spiritual', 'Other'
    ];
    await Religion.insertMany(initialReligions.map(name => ({ name })));
    console.log('Initial religions seeded.');
  }

  const communityCount = await Community.countDocuments();
  if (communityCount === 0) {
    const initialCommunities = [
      'Brahmin', 'Rajput', 'Jat', 'Arora', 'Kayastha', 'Agarwal', 'Khatri', 'Gupta', 'Yadav', 'Thakur', 'Maratha', 'Nadar', 'Ezhava', 'Iyer', 'Kamma', 'Reddy', 'Kapu', 'Nair', 'Sunni', 'Shia', 'Catholic', 'Protestant', 'Orthodox'
    ];
    await Community.insertMany(initialCommunities.map(name => ({ name })));
    console.log('Initial communities seeded.');
  }
}

// GET Religions
app.get('/api/religions', async (req, res) => {
  try {
    const religions = await Religion.find({}).select('name');
    return res.status(200).json(religions);
  } catch (error) {
    console.error('Error fetching religions:', error.message);
    return res.status(500).json({ error: 'Failed to fetch religions' });
  }
});

// POST Religion
app.post('/api/religions', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Religion name is required' });
    }
    const existingReligion = await Religion.findOne({ name });
    if (existingReligion) {
      return res.status(400).json({ error: 'Religion already exists' });
    }
    const religion = new Religion({ name });
    await religion.save();
    return res.status(201).json(religion);
  } catch (error) {
    console.error('Error adding religion:', error.message);
    return res.status(500).json({ error: 'Failed to add religion' });
  }
});

// GET Communities
app.get('/api/communities', async (req, res) => {
  try {
    const communities = await Community.find({}).select('name religion');
    return res.status(200).json(communities);
  } catch (error) {
    console.error('Error fetching communities:', error.message);
    return res.status(500).json({ error: 'Failed to fetch communities' });
  }
});

// POST Community
app.post('/api/communities', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Community name is required' });
    }
    const existingCommunity = await Community.findOne({ name });
    if (existingCommunity) {
      return res.status(400).json({ error: 'Community already exists' });
    }
    const community = new Community({ name });
    await community.save();
    return res.status(201).json(community);
  } catch (error) {
    console.error('Error adding community:', error.message);
    return res.status(500).json({ error: 'Failed to add community' });
  }
});


//

// Start server
const startServer = async () => {
  await connectMongoDB();
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();

