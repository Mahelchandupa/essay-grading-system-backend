const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/authMiddleware");
const Student = require("../models/Student");
const { createError } = require("../utils/errorResponse");

/**
 * GET /api/students/
 * Get student profile
 */
router.get("/", authenticateUser, async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.studentId });

    if (!student) {
    throw createError('NOT_FOUND', "Student not found");
    }

    res.json({
      success: true,
      student: {
        id: student.studentId,
        name: student.name,
        level: student.currentLevel,
        stats: student.stats,
        performanceMetrics: student.performanceMetrics,
        levelHistory: student.levelHistory.slice(-5), // Last 5 level changes
        warnings: student.warnings.filter((w) => !w.acknowledged),
      },
    });
  } catch (error) {
    // res.status(500).json({ error: error.message });
    throw createError('INTERNAL_ERROR',  error.message)
  }
});

/**
 * GET /api/students/progress
 * Get student progress over time
 */
router.get("/progress", authenticateUser, async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.studentId });

    if (!student) {
    throw createError('NOT_FOUND', "Student not found");
    }

    const Essay = require("../models/Essay");
    const essays = await Essay.find({ studentId: student._id })
      .sort({ submittedAt: 1 })
      .select("grading.finalScore grading.qualityScores submittedAt");

    res.json({
      success: true,
      progress: {
        currentLevel: student.currentLevel,
        levelHistory: student.levelHistory,
        scoreProgression: essays.map((e) => ({
          date: e.submittedAt,
          score: e.grading.finalScore,
          quality: e.grading.qualityScores,
        })),
        improvementRate: student.performanceMetrics.improvementRate,
        strengths: student.profile.strengths,
        weaknesses: student.profile.weaknesses,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw createError('INTERNAL_ERROR',  error.message)
  }
});

module.exports = router;
