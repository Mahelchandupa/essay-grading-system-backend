const express = require("express");
const router = express.Router();
const { catchAsync } = require("../utils/catchAsync");
const { createError } = require("../utils/errorResponse");
const AchievementService = require("../services/AchievementService");
const Student = require("../models/Student");
const { authenticateUser } = require("../middleware/authMiddleware");

/**
 * GET /api/achievements
 * Get all achievements for current student
 */
router.get("/", authenticateUser, catchAsync(async (req, res) => {
  // Use student ID from authenticated user, not from request body
  const studentId = req.userId;

  const achievements = await AchievementService.getStudentAchievements(studentId);

  if (!achievements) {
    throw createError('NOT_FOUND', "Student not found");
  }

  res.json({
    success: true,
    data: achievements,
  });
}));

/**
 * POST /api/achievements/track-tab
 * Track feedback tab view
 */
router.post("/track-tab", authenticateUser, catchAsync(async (req, res) => {
  const { tabName } = req.body;
  const studentId = req.student.studentId;

  if (!tabName) {
    throw createError('BAD_REQUEST', "Tab name is required");
  }

  await AchievementService.trackFeedbackTabView(studentId, tabName);

  res.json({
    success: true,
    message: "Tab view tracked successfully",
  });
}));

/**
 * POST /api/achievements/track-resource
 * Track learning resource access
 */
router.post("/track-resource", authenticateUser, catchAsync(async (req, res) => {
  const studentId = req.student.studentId;

  await AchievementService.trackResourceAccess(studentId);

  res.json({
    success: true,
    message: "Resource access tracked successfully",
  });
}));

/**
 * PUT /api/achievements/mark-seen
 * Mark achievement notifications as seen
 */
router.put("/mark-seen", authenticateUser, catchAsync(async (req, res) => {
  const { badgeIds } = req.body;
  const studentId = req.student.studentId;

  if (!badgeIds || !Array.isArray(badgeIds)) {
    throw createError('BAD_REQUEST', "Badge IDs array is required");
  }

  const student = await Student.findOne({ studentId });
  if (!student) {
    throw createError('NOT_FOUND', "Student not found");
  }

  student.markAchievementsSeen(badgeIds);
  await student.save();

  res.json({
    success: true,
    message: "Achievements marked as seen successfully",
    data: {
      markedCount: badgeIds.length
    }
  });
}));

/**
 * GET /api/achievements/progress
 * Get achievement progress for current student
 */
router.get("/progress", authenticateUser, catchAsync(async (req, res) => {
  const studentId = req.student.studentId;

  const progress = await AchievementService.getAchievementProgress(studentId);

  res.json({
    success: true,
    data: progress,
  });
}));

/**
 * POST /api/achievements/track-essay-review
 * Track essay review completion
 */
router.post("/track-essay-review", authenticateUser, catchAsync(async (req, res) => {
  const { essayId, timeSpent } = req.body;
  const studentId = req.student.studentId;

  if (!essayId) {
    throw createError('BAD_REQUEST', "Essay ID is required");
  }

  await AchievementService.trackEssayReview(studentId, essayId, timeSpent);

  res.json({
    success: true,
    message: "Essay review tracked successfully",
  });
}));

module.exports = router;