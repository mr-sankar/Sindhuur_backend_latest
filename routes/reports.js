const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Report = require('../modals/reportSchema'); // Adjust path as needed
const User = require('../modals/userSchema'); // Adjust path as needed

router.post('/report-profile', async (req, res) => {
  try {
    console.log('Received report request:', req.body);
    const {
      reportingUserId,
      reportedProfileId,
      reason,
      category,
      message,
      name,
      location,
      profession,
      education,
    } = req.body;

    // Validate required fields
    if (
      !reportingUserId ||
      !reportedProfileId ||
      !reason ||
      !category ||
      !message ||
      !name ||
      !location ||
      !profession ||
      !education
    ) {
      console.log('Validation failed for required fields:', {
        reportingUserId,
        reportedProfileId,
        reason,
        category,
        message,
        name,
        location,
        profession,
        education,
      });
      return res.status(400).json({
        error:
          'All fields are required: reportingUserId, reportedProfileId, reason, category, message, name, location, profession, education',
      });
    }

    // Check if a report already exists for this user and profile
    const existingReport = await Report.findOne({
      reportingUserId,
      reportedProfileId,
    });
    if (existingReport) {
      return res
        .status(400)
        .json({ error: 'You have already reported this profile' });
    }

    // Create array of all report details
    const reportDetails = [
      reportingUserId,
      reportedProfileId,
      reason,
      category,
      message,
      name,
      location,
      profession,
      education,
    ];

    // Create and save new report
    const newReport = new Report({
      reportingUserId,
      reportedProfileId,
      details: reportDetails,
      category,
      priority: 'Medium',
      status: 'open',
      createdAt: new Date(),
    });

    await newReport.save();
    console.log('Report saved successfully:', newReport);

    res.status(201).json({
      message: 'Report submitted successfully',
      report: {
        id: newReport._id,
        details: newReport.details,
        createdAt: newReport.createdAt,
      },
    });
  } catch (error) {
    console.error('Error submitting report:', error.message, error.stack);
    res
      .status(500)
      .json({ error: `Failed to submit report: ${error.message}` });
  }
});

router.get('/report-status', async (req, res) => {
  try {
    const { reportingUserId, reportedProfileId } = req.query;

    if (!reportingUserId || !reportedProfileId) {
      return res
        .status(400)
        .json({ error: 'reportingUserId and reportedProfileId are required' });
    }

    const report = await Report.findOne({ reportingUserId, reportedProfileId });
    res.status(200).json({ hasReported: !!report });
  } catch (error) {
    console.error('Error checking report status:', error.message, error.stack);
    res
      .status(500)
      .json({ error: `Failed to check report status: ${error.message}` });
  }
});


router.get('/reports', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.toString() || '';

    // Build query for search - search across all relevant fields
    const query = search
      ? {
          $or: [
            { 'details.5': { $regex: search, $options: 'i' } }, // name
            { 'details.1': { $regex: search, $options: 'i' } }, // reportedProfileId
            { 'details.4': { $regex: search, $options: 'i' } }, // message
            { reportingUserId: { $regex: search, $options: 'i' } },
            { reportedProfileId: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    // Always sort by createdAt descending (newest first)
    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await Report.countDocuments(query);

    res.status(200).json({
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching reports:', error.message, error.stack);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error.message });
  }
});
router.get('/reports/stats', async (req, res) => {
  try {
    const stats = await Report.aggregate([
      {
        $group: {
          _id: null,
          pending: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          under_review: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
          },
          resolved: {
            $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] },
          },
          closed: {
            $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] },
          },
          critical: {
            $sum: { $cond: [{ $eq: ['$priority', 'critical'] }, 1, 0] },
          },
        },
      },
    ]);

    const result = stats[0] || {
      pending: 0,
      under_review: 0,
      resolved: 0,
      closed: 0,
      critical: 0,
    };
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching reports stats:', error.message, error.stack);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error.message });
  }
});

router.patch('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    const {
      priority,
      category,
      assignedTo,
      status,
      resolutionNotes,
      actionTaken,
    } = req.body;
    const updateFields = {};
    if (priority) updateFields.priority = priority;
    if (category) updateFields.category = category;
    if (assignedTo) updateFields.assignedTo = assignedTo;
    if (status) updateFields.status = status;
    if (resolutionNotes) updateFields.resolutionNotes = resolutionNotes;
    if (actionTaken) updateFields.actionTaken = actionTaken;

    const report = await Report.findByIdAndUpdate(id, updateFields, {
      new: true,
    });
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.status(200).json({ message: 'Report updated successfully', report });
  } catch (error) {
    console.error('Error updating report:', error.message, error.stack);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error.message });
  }
});

router.get('/moderators', async (req, res) => {
  try {
    const moderators = await User.find({ role: 'moderator' }).select('email');
    res.status(200).json({ moderators: moderators.map((m) => m.email) });
  } catch (error) {
    console.error('Error fetching moderators:', error.message, error.stack);
    res
      .status(500)
      .json({ error: `Failed to fetch moderators: ${error.message}` });
  }
});

module.exports = router;