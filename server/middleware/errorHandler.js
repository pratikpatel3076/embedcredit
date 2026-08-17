function errorHandler(err, req, res, next) {
  const requestId = req.requestId || "REQ-UNKNOWN";
  const statusCode = err.status || err.statusCode || (err.name === "ValidationError" ? 400 : 500);

  let code = err.code || "INTERNAL_ERROR";
  let message = err.message || "An unexpected error occurred.";

  if (err.name === "ValidationError") {
    code = "VALIDATION_FAILED";
    message = "Request validation failed. Check parameter types and boundaries.";
  } else if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    code = "UNAUTHORIZED";
    message = "Invalid or expired authorization token.";
  }

  // Log error internally
  if (statusCode >= 500) {
    console.error(`[Error ${requestId}]`, err.stack || err);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV === "development" ? { details: err.errors || err.stack } : {}),
    },
    requestId,
  });
}

module.exports = { errorHandler };
