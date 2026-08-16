// ── Validation middleware ────────────────────────────────────────
const {
  MIN_AMOUNT,
  CIBIL_MIN,
  CIBIL_MAX,
  PURPOSES,
  TENURE_OPTIONS,
} = require("../config/constants");

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MOBILE_RE = /^[6-9]\d{9}$/;

function isPan(value) {
  return PAN_RE.test(String(value || "").toUpperCase());
}

function isMobile(value) {
  return MOBILE_RE.test(String(value || ""));
}

// DLA application submission validator. Enforces the platform rule that
// aaConsent MUST be true — otherwise 400.
function validateApplication(req, res, next) {
  const b = req.body || {};
  const errors = {};

  if (!b.borrowerName || !String(b.borrowerName).trim()) {
    errors.borrowerName = "Borrower name is required";
  }
  if (!isPan(b.pan)) {
    errors.pan = "PAN must match format ABCDE1234F";
  }
  if (!isMobile(b.mobile)) {
    errors.mobile = "Mobile must be a valid 10-digit Indian number starting with 6-9";
  }
  const amount = Number(b.amount);
  if (Number.isNaN(amount) || amount < MIN_AMOUNT) {
    errors.amount = `Loan amount must be at least ₹${MIN_AMOUNT}`;
  }
  if (!PURPOSES.includes(b.purpose)) {
    errors.purpose = "Invalid loan purpose";
  }
  const tenure = Number(b.tenure);
  if (!TENURE_OPTIONS.includes(tenure)) {
    errors.tenure = "Invalid tenure";
  }
  const cibil = Number(b.cibilScore);
  if (Number.isNaN(cibil) || cibil < CIBIL_MIN || cibil > CIBIL_MAX) {
    errors.cibilScore = `CIBIL score must be between ${CIBIL_MIN} and ${CIBIL_MAX}`;
  }
  const income = Number(b.monthlyIncome);
  if (Number.isNaN(income) || income < 10000) {
    errors.monthlyIncome = "Monthly income must be at least ₹10,000";
  }
  const obligations = Number(b.monthlyObligations || 0);
  if (Number.isFinite(income) && obligations >= income) {
    errors.monthlyObligations = "Monthly obligations cannot equal or exceed income";
  }
  if (b.aaConsent !== true) {
    errors.aaConsent = "AA consent is mandatory (must be true)";
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: "Validation failed", errors });
  }

  req.body.pan = String(b.pan).toUpperCase();
  req.body.amount = amount;
  req.body.tenure = tenure;
  req.body.cibilScore = cibil;
  req.body.monthlyIncome = income;
  req.body.monthlyObligations = obligations;
  next();
}

// Lender onboarding validator (ADMIN only).
function validateLender(req, res, next) {
  const b = req.body || {};
  const errors = {};

  if (!b.lenderName) errors.lenderName = "lenderName is required";
  if (!["Bank", "NBFC"].includes(b.type)) errors.type = "type must be Bank or NBFC";
  if (Number(b.minAmount) < 0 || Number(b.maxAmount) <= Number(b.minAmount)) {
    errors.amount = "Invalid minAmount / maxAmount range";
  }
  if (Number(b.interestRate) <= 0) errors.interestRate = "interestRate must be > 0";
  if (b.minCibilScore === undefined) errors.minCibilScore = "minCibilScore is required";
  if (Number(b.maxDti) <= 0 || Number(b.maxDti) > 1) errors.maxDti = "maxDti must be between 0 and 1";
  if (Number(b.processingFee) < 0) errors.processingFee = "processingFee cannot be negative";
  if (!Array.isArray(b.tenureMonths) || !b.tenureMonths.length) errors.tenureMonths = "tenureMonths must be a non-empty array";
  if (!Array.isArray(b.supportedPurposes) || !b.supportedPurposes.length) errors.supportedPurposes = "supportedPurposes must be a non-empty array";

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: "Validation failed", errors });
  }
  next();
}

module.exports = { validateApplication, validateLender, isPan, isMobile };
