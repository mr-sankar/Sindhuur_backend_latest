const express = require("express");
const mongoose = require("mongoose");
const Event = require("../../modals/admin/eventSchema");
const Notification = require("../../modals/admin/notificationSchema");
const User = require("../../modals/userSchema");

const router = express.Router();

// Helper function to validate required fields
const validateEventData = (data) => {
  const requiredFields = [
    "title",
    "description",
    "date",
    "time",
    "location",
    "type",
    "maxAttendees",
  ];
  const missingFields = requiredFields.filter((field) => !data[field]);
  return missingFields.length > 0
    ? `Missing required fields: ${missingFields.join(", ")}`
    : null;
};

// GET all events
// GET all events
// GET all events
router.get("/events", async (req, res) => {
  try {
    const { search, status, type, category, registeredUsers } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
        { organizer: { $regex: search, $options: "i" } },
      ];
    }

    if (status && status !== "all") {
      query.status = status;
    }

    if (type && type !== "all") {
      query.type = type;
    }

    if (category && category !== "all") {
      query.category = category;
    }

    if (registeredUsers) {
      if (!mongoose.Types.ObjectId.isValid(registeredUsers)) {
        return res.status(400).json({ message: `Invalid user ID: ${registeredUsers}` });
      }
      query.registeredUsers = new mongoose.Types.ObjectId(registeredUsers);
    }

    const events = await Event.find(query).populate({
      path: "registeredUsers",
      select: "name email profileId",
      options: { strictPopulate: false },
    });

    res.json(events);
  } catch (error) {
    console.error("Error fetching events:", error.message, error.stack);
    res.status(500).json({ message: "Error fetching events", error: error.message });
  }
});

// POST a new event
// POST a new event
router.post("/events", async (req, res) => {
  try {
    const { date, time, ...rest } = req.body;

    // Combine date and time to create a full Date object
    const eventDateTime = new Date(`${date}T${time}`);
    const now = new Date();

    // Validate that the event date is in the future
    if (eventDateTime < now) {
      return res.status(400).json({ message: "Event date and time must be in the future" });
    }

    const eventData = {
      ...rest,
      date: eventDateTime, // Store as Date
      time,
      createdDate: new Date(),
      organizer: req.body.organizer || "Admin",
      currentAttendees: 0,
      registeredUsers: [],
    };

    const validationError = validateEventData(eventData);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const event = new Event(eventData);
    await event.save();

    // Create notifications for all users
    const users = await User.find({});
    const notifications = users.map((user) => ({
      userId: user._id,
      eventId: event._id,
      message: `New event scheduled: ${event.title} on ${event.date.toLocaleDateString()}`,
      read: false,
    }));
    await Notification.insertMany(notifications);

    res.status(201).json(event);
  } catch (error) {
    console.error("Error creating event:", error.message, error.stack);
    res.status(500).json({ message: "Error creating event", error: error.message });
  }
});
router.get("/events/:id", async (req, res) => {
  try {
    const eventId = req.params.id;
    const { userId } = req.query;

    const event = await Event.findById(eventId).populate(
      "registeredUsers",
      "personalInfo.name personalInfo.email"
    );

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    let isRegistered = false;
    if (userId) {
      const user = await User.findOne({ profileId: userId });
      if (user) {
        isRegistered = event.registeredUsers.some(
          (regUser) => regUser._id.toString() === user._id.toString()
        );
      }
    }

    res.json({
      ...event.toObject(),
      isRegistered,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error fetching event", error: err.message });
  }
});

// PUT update an event
router.put("/events/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    const { date, time, ...rest } = req.body;

    // Validate date and time
    const eventDateTime = new Date(`${date}T${time}`);
    const now = new Date();
    if (eventDateTime < now) {
      return res.status(400).json({ message: "Event date and time must be in the future" });
    }

    const validationError = validateEventData({ date, time, ...rest });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: { date: eventDateTime, time, ...rest } },
      { new: true }
    ).populate({
      path: "registeredUsers",
      select: "name email profileId",
      options: { strictPopulate: false },
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  } catch (error) {
    console.error("Error updating event:", error.message, error.stack);
    res.status(500).json({ message: "Error updating event", error: error.message });
  }
});

// DELETE an event
router.delete("/events/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid event ID" });
    }

    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    await Notification.deleteMany({ eventId: req.params.id });
    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error.message, error.stack);
    res
      .status(500)
      .json({ message: "Error deleting event", error: error.message });
  }
});

// POST register/unregister for an event
// POST register/unregister for an event
router.post("/events/:id/register", async (req, res) => {
  try {
    const { userId } = req.body;
    const eventId = req.params.id;

    if (!userId) {
      return res
        .status(400)
        .json({ message: "User ID (profileId) is required" });
    }

    const user = await User.findOne({ profileId: userId });
    if (!user) {
      return res
        .status(404)
        .json({ message: `User not found for profileId: ${userId}` });
    }

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: `Invalid event ID: ${eventId}` });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (!Array.isArray(event.registeredUsers)) event.registeredUsers = [];
    if (!Array.isArray(user.registeredEvents)) user.registeredEvents = [];

    let notificationMessage = "";
    let isRegistered = false;

    if (event.registeredUsers.includes(user._id.toString())) {
      event.registeredUsers = event.registeredUsers.filter(
        (id) => id.toString() !== user._id.toString()
      );
      event.currentAttendees -= 1;

      user.registeredEvents = user.registeredEvents.filter(
        (id) => id.toString() !== eventId
      );

      notificationMessage = `User ${user.personalInfo.name} has unregistered from event: ${event.title}`;
    } else {
      if (event.currentAttendees >= event.maxAttendees) {
        return res.status(400).json({ message: "Event is full" });
      }

      event.registeredUsers.push(user._id);
      event.currentAttendees += 1;

      if (!user.registeredEvents.includes(event._id)) {
        user.registeredEvents.push(event._id);
      }

      notificationMessage = `User ${user.personalInfo.name} has registered for event: ${event.title}`;
      isRegistered = true;
    }

    await event.save();
    await user.save();

    const adminUsers = await User.find({ role: "admin" });
    const adminNotifications = adminUsers.map((admin) => ({
      userId: admin._id,
      eventId: event._id,
      message: notificationMessage,
      read: false,
    }));
    await Notification.insertMany(adminNotifications);

    const populatedEvent = await Event.findById(eventId).populate({
      path: "registeredUsers",
      select: "personalInfo.name personalInfo.email profileId", // FIX: Added profileId here too
      options: { strictPopulate: false },
    });

    res.json({
      ...populatedEvent.toObject(),
      isRegistered,
    });
  } catch (error) {
    console.error("Error registering for event:", error.message, error.stack);
    res
      .status(500)
      .json({ message: "Error registering for event", error: error.message });
  }
});

// GET notifications for a user
router.get("/notifications/:userId", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res
        .status(400)
        .json({ message: `Invalid user ID: ${req.params.userId}` });
    }

    const notifications = await Notification.find({ userId: req.params.userId })
      .populate("eventId")
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error.message, error.stack);
    res
      .status(500)
      .json({ message: "Error fetching notifications", error: error.message });
  }
});

// PUT mark notification as read
router.put("/notifications/:id/read", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res
        .status(400)
        .json({ message: `Invalid notification ID: ${req.params.id}` });
    }

    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    res.json(notification);
  } catch (error) {
    console.error(
      "Error marking notification as read:",
      error.message,
      error.stack
    );
    res
      .status(500)
      .json({
        message: "Error marking notification as read",
        error: error.message,
      });
  }
});

module.exports = router;