const jwt = require("jsonwebtoken");

exports.generateToken = (userId, duration = "24h") => {
  try {
    if (!userId) {
      throw new Error('User ID is required for token generation');
    }
    
    const token = jwt.sign(
      { userId: userId }, // Include userId in payload
      env_config.JWT_SECRET,
      {
        expiresIn: duration,
        algorithm: "HS256",
      }
    );
    return token;
  } catch (error) {
    console.error("Error generating token:", error);
    throw new FailureOccurredError("Failed to generate token");
  }
};

exports.verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, env_config.JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error("Error verifying token:", error);
    throw new TokenError("Failed to verify token");
  }
};

exports.validateToken = (token) => {
  if (!token) {
    throw new TokenMismatchError("Token is required");
  }
  try {
    const decoded = this.verifyToken(token);
    if (!decoded) {
      throw new TokenMismatchError("Invalid token");
    }
    return decoded;
  } catch (error) {
    console.error("Error validating token:", error);
    if (error instanceof TokenError) {
      throw error;
    }
    throw new TokenMismatchError("Token validation failed");
  }
};

exports.getTokenFromHeaders = (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new TokenMismatchError("Authorization header is missing");
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    throw new TokenMismatchError("Token is missing");
  }

  return token;
};