require('dotenv').config();
const jwt = require("jsonwebtoken");

exports.generateToken = (userId, studentId, duration = "24h") => {
  try {
    if (!userId || !studentId) {
      throw new Error('User ID and Student ID are required for token generation');
    }
    
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }
    
    const token = jwt.sign(
      { 
        userId: userId,
        studentId: studentId 
      },
      process.env.JWT_SECRET,
      {
        expiresIn: duration,
        algorithm: "HS256",
      }
    );
    return token;
  } catch (error) {
    console.error("Error generating token:", error);
    throw new Error("Failed to generate token");
  }
};

exports.verifyToken = (token) => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error("Error verifying token:", error);
    throw new Error("Invalid or expired token");
  }
};

exports.validateToken = (token) => {
  if (!token) {
    throw new Error("Token is required");
  }
  
  const decoded = this.verifyToken(token);
  if (!decoded || (!decoded.userId && !decoded.studentId)) {
    throw new Error("Invalid token payload");
  }
  
  return decoded;
};

// Extract token from headers
exports.getTokenFromHeaders = (req) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error("Authorization header with Bearer token is required");
  }
  
  return authHeader.substring(7); // Remove "Bearer " prefix
};