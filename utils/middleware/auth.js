const Student = require("../../models/Student");

// Check token is valid and attach user to req
exports.authenticate = catchAsync(async (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError("No token provided!", 401));
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists
    const user = await Student.findById(decoded.userId).select("-password");
    if (!user) {
      return next(new RecordNotFoundError("User no longer exists"));
    }

    // Grant access to protected route
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Invalid token", 401));
    } else if (error.name === "TokenExpiredError") {
      return next(new AppError("Token expired", 401));
    }
    return next(new AppError("Token verification failed", 401));
  }
});