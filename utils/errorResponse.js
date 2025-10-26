class AppError extends Error {
  constructor(message, statusCode, errorCode = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

// Standard error response format
const errorResponse = (error) => {
  // If it's already our custom error, use its properties
  if (error.isOperational) {
    return {
      success: false,
      error: {
        message: error.message,
        code: error.errorCode,
        statusCode: error.statusCode,
        details: error.details,
        timestamp: error.timestamp
      }
    };
  }

  // For mongoose validation errors
  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
    
    return {
      success: false,
      error: {
        message: 'Validation Failed',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: details,
        timestamp: new Date().toISOString()
      }
    };
  }

  // For mongoose duplicate key errors
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return {
      success: false,
      error: {
        message: `${field} already exists`,
        code: 'DUPLICATE_ENTRY',
        statusCode: 409,
        details: { field, value: error.keyValue[field] },
        timestamp: new Date().toISOString()
      }
    };
  }

  // For JWT errors
  if (error.name === 'JsonWebTokenError') {
    return {
      success: false,
      error: {
        message: 'Invalid token',
        code: 'INVALID_TOKEN',
        statusCode: 401,
        timestamp: new Date().toISOString()
      }
    };
  }

  if (error.name === 'TokenExpiredError') {
    return {
      success: false,
      error: {
        message: 'Token expired',
        code: 'TOKEN_EXPIRED',
        statusCode: 403,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Default error (don't expose internal details in production)
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    success: false,
    error: {
      message: isProduction ? 'Internal server error' : error.message,
      code: 'INTERNAL_ERROR',
      statusCode: error.statusCode || 500,
      details: isProduction ? null : { stack: error.stack },
      timestamp: new Date().toISOString()
    }
  };
};

// Common error types
const ERROR_TYPES = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', statusCode: 401 },
  FORBIDDEN: { code: 'FORBIDDEN', statusCode: 403 },
  NOT_FOUND: { code: 'NOT_FOUND', statusCode: 404 },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', statusCode: 400 },
  DUPLICATE_ENTRY: { code: 'DUPLICATE_ENTRY', statusCode: 409 },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', statusCode: 500 },
  BAD_REQUEST: { code: 'BAD_REQUEST', statusCode: 400 },
  TOKEN_EXPIRED: { code: 'TOKEN_EXPIRED', statusCode: 403 },
  INVALID_TOKEN: { code: 'INVALID_TOKEN', statusCode: 401 },
  SERVICE_UNAVAILABLE: { code: 'SERVICE_UNAVAILABLE', statusCode: 503 },
  TIMEOUT: { code: 'TIMEOUT', statusCode: 408 }
};

// Helper functions to create common errors
const createError = (type, message, details = null) => {
  const errorType = ERROR_TYPES[type] || ERROR_TYPES.INTERNAL_ERROR;
  return new AppError(message, errorType.statusCode, errorType.code, details);
};

module.exports = {
  AppError,
  errorResponse,
  ERROR_TYPES,
  createError
};