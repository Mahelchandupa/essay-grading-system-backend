const Student = require("../models/Student");
const express = require('express');
const { generateToken } = require("../utils/tokens/getToken");
const router = express.Router();

/**
 * GET /api/students
 * Sign In student
 */
router.post('/signin', async (req, res) => {
  try {
    const { studentId, password } = req.body;

    const student = await Student.findOne({ studentId });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const isPasswordValid = await student.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

   // Generate token with user ID
   const accessToken = generateToken(student._id);

    res.json({
      success: true,
      token: accessToken,
      student: {
        id: student.studentId,
        name: student.name,
        level: student.currentLevel
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/students
 * Create new student
 */
router.post('/signup', async (req, res) => {
  try {
    const { studentId, name, email, password } = req.body;

    const existingStudent = await Student.findOne({ 
      $or: [{ studentId }, { email }] 
    });

    if (existingStudent) {
      return res.status(400).json({ 
        error: 'Student with this ID or email already exists' 
      });
    }

    const student = await Student.create({
      studentId,
      name,
      email,
      password,
      currentLevel: 'beginner',
      levelHistory: [{
        level: 'beginner',
        changedAt: new Date(),
        reason: 'initial_registration',
        triggeredBy: 'system'
      }]
    });

    res.status(201).json({
      success: true,
      student: {
        id: student.studentId,
        name: student.name,
        level: student.currentLevel
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;