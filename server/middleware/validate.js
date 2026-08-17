// ── Validation Helpers & Express Middleware ──

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function isPan(v) {
  return typeof v === "string" && PAN_REGEX.test(v.toUpperCase());
}

function validateApplication(req, res, next) {
  const b = req.body || {};
  const errors = [];

  if (!b.borrowerName || typeof b.borrowerName !== "string" || !b.borrowerName.trim()) {
    errors.push("borrowerName is required");
  }
  if (!isPan(b.pan)) {
    errors.push("Valid 10-character PAN is required (e.g. ABCDE1234F)");
  }
  if (!b.mobile || !/^[6-9]\d{9}$/.test(String(b.mobile))) {
    errors.push("Valid 10-digit Indian mobile number is required");
  }
  if (typeof b.amount !== "number" || b.amount < 5000) {
    errors.push("amount must be a number >= 5,000");
  }
  if (!b.purpose || typeof b.purpose !== "string") {
    errors.push("purpose is required");
  }
  if (typeof b.tenure !== "number" || b.tenure < 1) {
    errors.push("tenure must be a number of months >= 1");
  }
  if (typeof b.cibilScore !== "number" || b.cibilScore < 300 || b.cibilScore > 900) {
    errors.push("cibilScore must be a number between 300 and 900");
  }
  if (typeof b.monthlyIncome !== "number" || b.monthlyIncome <= 0) {
    errors.push("monthlyIncome must be a positive number");
  }
  if (b.aaConsent !== true) {
    errors.push("aaConsent must be true");
  }

  if (errors.length) {
    return res.status(400).json({ error: "Validation failed", errors });
  }

  next();
}

function validateLender(req, res, next) {
  const b = req.body || {};
  const errors = [];

  if (!b.lenderName || typeof b.lenderName !== "string") {
    errors.push("lenderName is required");
  }
  if (!["Bank", "NBFC"].includes(b.type)) {
    errors.push("type must be 'Bank' or 'NBFC'");
  }
  if (typeof b.minAmount !== "number" || typeof b.maxAmount !== "number" || b.minAmount >= b.maxAmount) {
    errors.push("minAmount must be less than maxAmount");
  }
  if (typeof b.interestRate !== "number" || b.interestRate <= 0) {
    errors.push("interestRate must be > 0");
  }
  if (!Array.isArray(b.tenureMonths) || !b.tenureMonths.length) {
    errors.push("tenureMonths must be a non-empty array");
  }
  if (typeof b.minCibilScore !== "number") {
    errors.push("minCibilScore is required");
  }
  if (typeof b.maxDti !== "number" || b.maxDti <= 0 || b.maxDti > 1) {
    errors.push("maxDti must be between 0 and 1");
  }
  if (!Array.isArray(b.supportedPurposes) || !b.supportedPurposes.length) {
    errors.push("supportedPurposes must be a non-empty array");
  }

  if (errors.length) {
    return res.status(400).json({ error: "Validation failed", errors });
  }

  next();
}

const VALID_TRANSITIONS = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["ELIGIBILITY_CHECK", "OFFERS_AVAILABLE", "ROUTED", "REJECTED", "CANCELLED"],
  ELIGIBILITY_CHECK: ["OFFERS_AVAILABLE", "REJECTED", "CANCELLED"],
  OFFERS_AVAILABLE: ["OFFER_SELECTED", "EXPIRED", "CANCELLED"],
  OFFER_SELECTED: ["KFS_GENERATED", "KFS_ACCEPTED", "ROUTED", "CANCELLED"],
  KFS_GENERATED: ["KFS_ACCEPTED", "CANCELLED"],
  KFS_ACCEPTED: ["ROUTED", "LENDER_REVIEW", "CANCELLED"],
  ROUTED: ["LENDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  LENDER_REVIEW: ["APPROVED", "REJECTED", "WITHDRAWN"],
  APPROVED: ["DISBURSAL_PENDING", "DISBURSED", "CANCELLED"],
  DISBURSAL_PENDING: ["DISBURSED", "CANCELLED"],
  DISBURSED: ["ACTIVE", "CLOSED"],
  ACTIVE: ["CLOSED"],
  // Legacy compatibility
  new: ["pending_review", "routed", "rejected"],
  pending_review: ["routed", "rejected"],
  routed: ["disbursed", "rejected"],
};

function isValidStateTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return true;
  const allowed = VALID_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

module.exports = {
  isPan,
  validateApplication,
  validateLender,
  isValidStateTransition,
  VALID_TRANSITIONS,
};
