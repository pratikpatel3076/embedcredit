const mongoose = require("mongoose");

const CONSENT_TYPES = [
  "KYC_IDENTITY",
  "CREDIT_ASSESSMENT",
  "AA_FINANCIAL_DATA",
  "BUREAU_DATA",
  "LOAN_SERVICING",
  "REPAYMENT_DATA",
  "FRAUD_PREVENTION",
  "DEVICE_DATA",
  "BEHAVIOURAL_DATA",
  "LENDER_DATA_SHARING",
  "THIRD_PARTY_PROCESSING",
  // Legacy aliases
  "AA_DATA",
  "BUREAU_PULL",
  "DATA_PROCESSING",
];

const DATA_CATEGORIES = [
  "PERSONAL_IDENTIFIERS",
  "FINANCIAL_DATA",
  "CREDIT_HISTORY",
  "DEVICE_BEHAVIOURAL",
  "LENDER_PROCESSING",
  "DLA_PROCESSING",
  "THIRD_PARTY_SHARING",
];

const CONSENT_STATUSES = ["PENDING", "GRANTED", "ACTIVE", "REVOKED", "EXPIRED", "REJECTED"];

const consentRecordSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    consentType: {
      type: String,
      enum: CONSENT_TYPES,
      required: true,
    },
    purpose: { type: String, required: true },
    dataCategory: {
      type: String,
      enum: DATA_CATEGORIES,
      default: "FINANCIAL_DATA",
    },
    requestedBy: { type: String, default: "PLATFORM" },
    provider: { type: String, required: true },
    status: {
      type: String,
      enum: CONSENT_STATUSES,
      default: "GRANTED",
    },
    consentVersion: { type: String, default: "AA-CONSENT-v2.1" },
    version: { type: String, default: "AA-CONSENT-v2.1" }, // Backward-compatibility alias
    grantedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revocationReason: { type: String, default: null },
    source: { type: String, default: "CONSUMER_DASHBOARD" },
    applicationId: { type: String, default: null, index: true },
    loanId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

consentRecordSchema.set("toJSON", { virtuals: false });
consentRecordSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("ConsentRecord", consentRecordSchema);
module.exports.CONSENT_TYPES = CONSENT_TYPES;
module.exports.DATA_CATEGORIES = DATA_CATEGORIES;
module.exports.CONSENT_STATUSES = CONSENT_STATUSES;

