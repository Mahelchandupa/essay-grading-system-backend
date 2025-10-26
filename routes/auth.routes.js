const express = require('express');
const { catchAsync } = require("../utils/catchAsync");
const { createError } = require("../utils/errorResponse");
const Student = require("../models/Student");
const { generateToken } = require("../utils/tokens/getToken");
const { authenticateUser } = require('../middleware/authMiddleware');
const router = express.Router();

/**
 * POST /api/auth/signin
 * Sign In student with either studentId or email
 */
router.post('/signin', catchAsync(async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    throw createError('BAD_REQUEST', 'Login and password are required');
  }

  // Find student by either studentId or email
  const student = await Student.findOne({
    $or: [
      { studentId: login },
      { email: login.toLowerCase() }
    ]
  }).select('+password');

  if (!student) {
    throw createError('NOT_FOUND', 'Student not found');
  }

  const isPasswordValid = await student.comparePassword(password);
  if (!isPasswordValid) {
    throw createError('UNAUTHORIZED', 'Invalid password');
  }

  // Generate token with both IDs
  const accessToken = generateToken(student._id, student.studentId);

  res.json({
    success: true,
    token: accessToken,
    student: {
      id: student.studentId,
      mongoId: student._id,
      name: student.name,
      email: student.email,
      level: student.currentLevel
    },
    message: "Sign in successful"
  });
}));

/**
 * POST /api/auth/signup
 * Create new student and automatically sign them in
 */
router.post('/signup', catchAsync(async (req, res) => {
  const { studentId, name, email, password } = req.body;
  console.log("called signup");

  // Validate required fields
  if (!studentId || !name || !email || !password) {
    throw createError('BAD_REQUEST', 'All fields are required: studentId, name, email, password');
  }

  const existingStudent = await Student.findOne({ 
    $or: [{ studentId }, { email: email.toLowerCase() }] 
  });

  if (existingStudent) {
    throw createError('DUPLICATE_ENTRY', 'Student with this ID or email already exists');
  }

  const student = await Student.create({
    studentId,
    name,
    email: email.toLowerCase(),
    password,
    currentLevel: 'beginner',
    levelHistory: [{
      level: 'beginner',
      changedAt: new Date(),
      reason: 'initial_registration',
      triggeredBy: 'system'
    }]
  });

  // Generate token with both IDs (automatic sign in after signup)
  const accessToken = generateToken(student._id, student.studentId);

  res.status(201).json({
    success: true,
    token: accessToken,
    student: {
      id: student.studentId,
      mongoId: student._id,
      name: student.name,
      email: student.email,
      level: student.currentLevel
    },
    message: "Account created and signed in successfully"
  });
}));

/**
 * GET /api/students/profile
 * Get current student profile (Protected)
 */
router.get('/profile', authenticateUser, catchAsync(async (req, res) => {
  res.json({
    success: true,
    student: {
      id: req.student.studentId,
      mongoId: req.student._id,
      name: req.student.name,
      email: req.student.email,
      level: req.student.currentLevel,
      stats: req.student.stats
    }
  });
}));

/**
 * POST /api/auth/logout
 * Client-side logout (just inform client to remove token)
 */
router.post('/logout', authenticateUser, catchAsync(async (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully"
  });
}));

module.exports = router;