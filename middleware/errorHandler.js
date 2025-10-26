const { errorResponse } = require("../utils/errorResponse");

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    user: req.student?.studentId || 'unauthenticated'
  });

  const errorResponseData = errorResponse(error);
  
  res.status(errorResponseData.error.statusCode).json(errorResponseData);
};

module.exports = errorHandler;