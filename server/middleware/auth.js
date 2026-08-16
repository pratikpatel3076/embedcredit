// ── JWT auth + role-based access control ─────────────────────────
const jwt = require("jsonwebtoken");
const { JWT_EXPIRES_IN } = require("../config/constants");

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "vantage_credit_secret_key_2026");
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Require one of the listed roles. Must run after authenticate().
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: `Requires role: ${roles.join(" / ")}` });
    }
    next();
  };
}

// Role-scoped single-application access.
//   DLA    -> only applications the DLA originated (dlaId match)
//   LENDER -> only applications routed to that lender's product
//   ADMIN  -> any
// Attaches the loaded document to req.application.
async function canAccessApplication(req, res, next) {
  const app = await require("../models/LoanApplication").findOne({
    id: req.params.id,
  });
  if (!app) return res.status(404).json({ error: "Application not found" });
  req.application = app;

  if (req.user.role === "ADMIN") return next();
  if (req.user.role === "DLA" && app.dlaId === req.user.dlaId) return next();
  if (req.user.role === "LENDER" && app.routedTo === req.user.lenderId) {
    return next();
  }
  return res.status(403).json({ error: "Not authorized to access this application" });
}

module.exports = { authenticate, requireRole, canAccessApplication };
