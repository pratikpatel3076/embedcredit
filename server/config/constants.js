// ── Compliance & domain constants ────────────────────────────────
// FLDG_CAP is read from env so docker-compose / .env can override it.

module.exports = {
  // First Loss Default Guarantee cap (fraction of a lender's portfolio value).
  // RBI Digital Lending Guidelines 2022 — 5%.
  FLDG_CAP: parseFloat(process.env.FLDG_CAP || 0.05),

  // Maximum acceptable Debt-To-Income ratio used across the platform.
  MAX_DTI: 0.55,

  CIBIL_MIN: 300,
  CIBIL_MAX: 900,

  MIN_AMOUNT: 5000,

  // Account Aggregator consent validity window (in days).
  AA_CONSENT_VALIDITY_DAYS: 365,

  PURPOSES: [
    "personal",
    "consumer",
    "education",
    "medical",
    "emergency",
    "sme",
    "working_capital",
  ],

  TENURE_OPTIONS: [3, 6, 9, 12, 18, 24, 36, 48, 60],

  APP_STATUSES: ["new", "pending_review", "routed", "disbursed", "rejected"],
  ROUTE_STATUSES: ["pending", "accepted", "rejected", "disbursed"],
  LENDER_TYPES: ["Bank", "NBFC"],
  ROLES: ["DLA", "LENDER", "ADMIN"],

  JWT_EXPIRES_IN: "12h",
};
