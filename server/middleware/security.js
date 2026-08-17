const crypto = require("crypto");

function requestIdMiddleware(req, res, next) {
  const reqId = req.headers["x-request-id"] || `REQ-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  req.requestId = reqId;
  res.setHeader("X-Request-ID", reqId);
  next();
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) {
      delete obj[key];
    } else if (typeof obj[key] === "object") {
      sanitizeObject(obj[key]);
    }
  }
  return obj;
}

function sanitizeQuery(req, res, next) {
  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);
  next();
}

module.exports = { requestIdMiddleware, securityHeaders, sanitizeQuery };
