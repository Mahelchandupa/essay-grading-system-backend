const Student = require("../models/Student");
const { errorResponse, createError } = require("../utils/errorResponse");
const { validateToken, getTokenFromHeaders } = require("../utils/tokens/getToken");

const authenticateUser = async (req, res, next) => {
  try {
    // Extract token from headers
    const token = getTokenFromHeaders(req);
    
    if (!token) {
      throw createError('UNAUTHORIZED', 'Authentication token required');
    }
    
    // Validate and decode token
    const decoded = validateToken(token);
    
    // Find student by either MongoDB _id or studentId
    let student;
    if (decoded.userId) {
      student = await Student.findById(decoded.userId);
    }
    
    if (!student && decoded.studentId) {
      student = await Student.findOne({ studentId: decoded.studentId });
    }
    
    if (!student) {
      throw createError('NOT_FOUND', 'Student account not found');
    }
    
    // Attach student with both IDs to request object
    req.student = student;
    req.userId = student._id;
    req.studentId = student.studentId;
    
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    
    // If it's already our custom error, use it directly
    const response = errorResponse(error);
    return res.status(response.error.statusCode).json(response);
  }
};

module.exports = { authenticateUser };