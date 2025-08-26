// cronJobs.js
const cron = require("node-cron");
const Event = require("../../modals/admin/eventSchema");

const updateEventStatuses = async () => {
  try {
    const now = new Date();
    const events = await Event.find({
      status: { $in: ["upcoming", "ongoing"] },
    });

    for (const event of events) {
      const eventDateTime = new Date(event.date);
      const [hours, minutes] = event.time.split(":").map(Number);
      eventDateTime.setHours(hours, minutes, 0, 0);

      const fourHoursLater = new Date(eventDateTime.getTime() + 4 * 60 * 60 * 1000);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (now >= eventDateTime && now < fourHoursLater && event.status !== "ongoing") {
        // Event is ongoing
        event.status = "ongoing";
        await event.save();
        console.log(`Updated event ${event.title} to ongoing`);
      } else if (now >= fourHoursLater && event.status !== "completed") {
        // Event is completed (4 hours after start)
        event.status = "completed";
        await event.save();
        console.log(`Updated event ${event.title} to completed`);
      } else if (eventDateTime < startOfToday && event.status !== "completed") {
        // Event from previous day is completed
        event.status = "completed";
        await event.save();
        console.log(`Updated past event ${event.title} to completed`);
      }
    }
  } catch (error) {
    console.error("Error updating event statuses:", error.message, error.stack);
  }
};

// Schedule the job to run every minute
cron.schedule("* * * * *", updateEventStatuses);

module.exports = { updateEventStatuses };