// ── Consent Management Service ────────────────────────────────────
// Handles purpose-specific consent lifecycle, unbundled opt-ins,
// validation gates, revocation, and immutable audit logs.
// Compliant with RBI Digital Lending Guidelines 2022 & DPDP Act 2023.

const ConsentRecord = require("../models/ConsentRecord");
const ComplianceLog = require("../models/ComplianceLog");
const { nextConsentId } = require("../utils/idGenerator");
const { AA_CONSENT_VALIDITY_DAYS } = require("../config/constants");

const DEFAULT_CONSENT_VERSION = "AA-CONSENT-v2.1";

// ── Standard Consent Definitions Catalogue ─────────────────────────
const CONSENT_DEFINITIONS = [
  {
    type: "AA_FINANCIAL_DATA",
    title: "Account Aggregator Financial Data",
    dataCategory: "FINANCIAL_DATA",
    categoryLabel: "Financial Information",
    purpose: "Credit assessment, bank statement analysis, and income verification",
    purposeEnum: "CREDIT_ASSESSMENT",
    dataElements: [
      "Bank account statements (6–12 months)",
      "Salary and regular income credit patterns",
      "Average balance & recurring payment patterns",
      "Existing active loan obligations",
    ],
    prohibitedData: [
      "Aadhaar biometrics / XML",
      "Account net-banking login passwords",
      "Debit card CVV / PINs",
      "Unrelated merchant transaction tracking",
    ],
    provider: "Account Aggregator Ecosystem (Finvu / Sahamati / Setu MOCK)",
    recipient: "Eligible RBI-regulated Lending Partners (CreditSaison, Muthoot, InCred)",
    retentionPolicy: "Retained only during active loan evaluation & lifecycle (max 180 days default purge).",
    durationDays: AA_CONSENT_VALIDITY_DAYS || 180,
    revocable: true,
    version: DEFAULT_CONSENT_VERSION,
  },
  {
    type: "KYC_IDENTITY",
    title: "KYC & Identity Verification",
    dataCategory: "PERSONAL_IDENTIFIERS",
    categoryLabel: "Personal Identifiers",
    purpose: "Borrower identity verification, PAN validation, and anti-fraud AML screening",
    purposeEnum: "KYC_IDENTITY",
    dataElements: [
      "Full legal name",
      "Verified PAN identifier",
      "Mobile number & email address",
      "Self-declared employment & income details",
    ],
    prohibitedData: [
      "Aadhaar numbers (Zero-Aadhaar policy strictly enforced)",
      "Biometric data",
      "Fraudulent personal credentials",
    ],
    provider: "Verified KYC Rails & NSDL / PAN Verification (MOCK)",
    recipient: "Vantage Credit & Selected Lending Partner",
    retentionPolicy: "Retained for regulatory loan record-keeping as mandated by RBI.",
    durationDays: 365,
    revocable: true,
    version: DEFAULT_CONSENT_VERSION,
  },
  {
    type: "BUREAU_DATA",
    title: "Credit Bureau Score Query",
    dataCategory: "CREDIT_HISTORY",
    categoryLabel: "Credit History",
    purpose: "Creditworthiness assessment via official credit bureau inquiry",
    purposeEnum: "CREDIT_ASSESSMENT",
    dataElements: [
      "CIBIL / Experian / CRIF score",
      "Past loan repayment history",
      "Active credit line balances and defaults",
    ],
    prohibitedData: [
      "Speculative pre-qualification marketing pulls without explicit consent",
      "Unauthorized third-party data resale",
    ],
    provider: "CIBIL / TransUnion / CRIF High Mark",
    recipient: "Vantage Credit Decisioning Engine & Selected Underwriting Lender",
    retentionPolicy: "Max 1 hard pull per borrower per 90 days. Cached score reused for multi-lender comparison.",
    durationDays: 90,
    revocable: true,
    version: DEFAULT_CONSENT_VERSION,
  },
  {
    type: "LENDER_DATA_SHARING",
    title: "Regulated Lender Data Sharing",
    dataCategory: "LENDER_PROCESSING",
    categoryLabel: "Lender Data Usage",
    purpose: "Sharing necessary underwriting profile with the borrower-selected regulated lender",
    purposeEnum: "LENDER_DATA_SHARING",
    dataElements: [
      "Standardized loan application dossier",
      "Derived income, DTI, and CIBIL score",
      "KFS snapshot and offer parameters",
    ],
    prohibitedData: [
      "Cross-selling unrelated financial products",
      "Group-entity marketing sharing",
      "Speculative profiling",
    ],
    provider: "Vantage Credit Secure Protocol Rails",
    recipient: "Matched & Selected Regulated Lender",
    retentionPolicy: "Retained for the duration of the credit facility agreement.",
    durationDays: 365,
    revocable: true,
    version: DEFAULT_CONSENT_VERSION,
  },
  {
    type: "LOAN_SERVICING",
    title: "Digital Lending App (DLA) Servicing",
    dataCategory: "DLA_PROCESSING",
    categoryLabel: "Digital Lending App / LSP",
    purpose: "Loan application processing, repayment schedule tracking, and mandate orchestration",
    purposeEnum: "LOAN_SERVICING",
    dataElements: [
      "Drawdown and repayment milestone records",
      "eNACH mandate status",
      "Overdue and installment payment receipts",
    ],
    prohibitedData: [
      "Contact-list harvesting",
      "Background location surveillance",
      "Unauthorized third-party data leakage",
    ],
    provider: "Direct Lending Agent (DLA) / LSP Rails",
    recipient: "Platform Servicing & Payment Gateways",
    retentionPolicy: "Retained until loan is fully closed and settlement certificate issued.",
    durationDays: 365,
    revocable: true,
    version: DEFAULT_CONSENT_VERSION,
  },
  {
    type: "DEVICE_DATA",
    title: "Device & Behavioural Telemetry (Optional)",
    dataCategory: "DEVICE_BEHAVIOURAL",
    categoryLabel: "Device & Behavioural Data",
    purpose: "Optional fraud prevention and device integrity checks during checkout",
    purposeEnum: "FRAUD_PREVENTION",
    dataElements: [
      "Browser / OS environment info",
      "IP address subnet for geo-anomaly detection",
      "Session integrity tokens",
    ],
    prohibitedData: [
      "Phone contact list",
      "Call logs / SMS inbox",
      "Continuous GPS location tracking",
      "Microphone / Camera access",
    ],
    provider: "Vantage Fraud Engine (MOCK)",
    recipient: "Internal Risk & Security Systems",
    retentionPolicy: "Session tokens purged after 30 days.",
    durationDays: 90,
    revocable: true,
    version: DEFAULT_CONSENT_VERSION,
  },
  {
    type: "THIRD_PARTY_PROCESSING",
    title: "Third-Party Data Processing",
    dataCategory: "THIRD_PARTY_SHARING",
    categoryLabel: "Third-Party Sharing",
    purpose: "Processing required for secure payment gateway settlements and OCEN 4.0 protocol",
    purposeEnum: "THIRD_PARTY_PROCESSING",
    dataElements: [
      "NPCI eNACH registration tokens",
      "Payment gateway transaction reference IDs",
    ],
    prohibitedData: [
      "Raw bank account credentials",
      "Unauthorized third-party data resale",
    ],
    provider: "NPCI / Payment Gateways / OCEN Rails",
    recipient: "Authorized Financial Processors",
    retentionPolicy: "Retained in compliance with NPCI and RBI payment regulations.",
    durationDays: 365,
    revocable: true,
    version: DEFAULT_CONSENT_VERSION,
  },
];

/**
 * Returns all standardized consent categories and purpose definitions.
 */
function getConsentDefinitions() {
  return CONSENT_DEFINITIONS;
}

/**
 * Retrieves all consent records for a given user.
 */
async function getUserConsents(userId) {
  if (!userId) return [];
  return ConsentRecord.find({ userId }).sort({ createdAt: -1 });
}

/**
 * Grants a purpose-specific consent record.
 */
async function grantConsent({
  userId,
  consentType,
  purpose,
  dataCategory,
  requestedBy = "PLATFORM",
  provider,
  durationDays = 180,
  source = "CONSUMER_DASHBOARD",
  applicationId = null,
  loanId = null,
  metadata = {},
  actor = "SYSTEM",
  actorRole = "USER",
}) {
  if (!userId) throw new Error("userId is required for consent grant");
  if (!consentType) throw new Error("consentType is required for consent grant");

  // Lookup default definition if purpose/provider/dataCategory not explicitly provided
  const def = CONSENT_DEFINITIONS.find((d) => d.type === consentType);
  const finalPurpose = purpose || def?.purpose || "Financial data processing";
  const finalProvider = provider || def?.provider || "Account Aggregator Ecosystem";
  const finalCategory = dataCategory || def?.dataCategory || "FINANCIAL_DATA";
  const finalDays = durationDays || def?.durationDays || 180;

  const consentId = await nextConsentId();
  const grantedAt = new Date();
  const expiresAt = new Date(grantedAt);
  expiresAt.setDate(expiresAt.getDate() + finalDays);

  // Expire/supersede any previously active consent of the same type
  await ConsentRecord.updateMany(
    { userId, consentType, status: { $in: ["GRANTED", "ACTIVE"] } },
    { $set: { status: "EXPIRED", metadata: { supersededBy: consentId } } }
  );

  const consent = await ConsentRecord.create({
    id: consentId,
    userId,
    consentType,
    purpose: finalPurpose,
    dataCategory: finalCategory,
    requestedBy,
    provider: finalProvider,
    status: "GRANTED",
    consentVersion: DEFAULT_CONSENT_VERSION,
    version: DEFAULT_CONSENT_VERSION,
    grantedAt,
    expiresAt,
    revokedAt: null,
    source,
    applicationId,
    loanId,
    metadata,
  });

  await ComplianceLog.create({
    type: "CONSENT_GRANTED",
    userId,
    applicationId,
    actor,
    actorRole,
    pass: true,
    details: {
      consentId: consent.id,
      consentType: consent.consentType,
      purpose: consent.purpose,
      provider: consent.provider,
      version: consent.consentVersion,
      expiresAt: consent.expiresAt,
    },
  });

  return consent;
}

/**
 * Grants or updates a batch of explicit, purpose-specific consents.
 */
async function grantBatchConsents({
  userId,
  consents = [],
  source = "CONSUMER_DASHBOARD",
  applicationId = null,
  actor = "SYSTEM",
  actorRole = "USER",
}) {
  if (!userId) throw new Error("userId is required for batch consent");
  if (!Array.isArray(consents)) throw new Error("consents must be an array");

  const results = [];
  for (const item of consents) {
    if (item.granted) {
      const record = await grantConsent({
        userId,
        consentType: item.consentType || item.type,
        purpose: item.purpose,
        dataCategory: item.dataCategory,
        requestedBy: item.requestedBy || "CONSUMER_SELECTION",
        provider: item.provider,
        durationDays: item.durationDays,
        source,
        applicationId,
        actor,
        actorRole,
      });
      results.push(record);
    } else if (item.rejected) {
      await rejectConsent({
        userId,
        consentType: item.consentType || item.type,
        purpose: item.purpose,
        source,
        actor,
        actorRole,
      });
    }
  }

  return results;
}

/**
 * Revokes an existing active consent record.
 */
async function revokeConsent({ consentId, userId, reason = "User initiated revocation", actor = "SYSTEM", actorRole = "USER" }) {
  if (!consentId) throw new Error("consentId is required");

  const query = { id: consentId };
  if (userId) query.userId = userId;

  const consent = await ConsentRecord.findOne(query);
  if (!consent) {
    throw new Error("Consent record not found or access unauthorized");
  }

  if (consent.status === "REVOKED") {
    return consent; // Already revoked
  }

  consent.status = "REVOKED";
  consent.revokedAt = new Date();
  consent.revocationReason = reason;
  await consent.save();

  await ComplianceLog.create({
    type: "CONSENT_REVOKED",
    userId: consent.userId,
    applicationId: consent.applicationId,
    actor,
    actorRole,
    pass: true,
    details: {
      consentId: consent.id,
      consentType: consent.consentType,
      purpose: consent.purpose,
      reason,
      revokedAt: consent.revokedAt,
    },
  });

  return consent;
}

/**
 * Rejects a consent request explicitly.
 */
async function rejectConsent({
  userId,
  consentType,
  purpose = "User rejected consent request",
  source = "CONSUMER_DASHBOARD",
  actor = "SYSTEM",
  actorRole = "USER",
}) {
  const consentId = await nextConsentId();
  const consent = await ConsentRecord.create({
    id: consentId,
    userId,
    consentType,
    purpose,
    provider: "User Action",
    status: "REJECTED",
    consentVersion: DEFAULT_CONSENT_VERSION,
    version: DEFAULT_CONSENT_VERSION,
    grantedAt: new Date(),
    expiresAt: new Date(),
    source,
  });

  await ComplianceLog.create({
    type: "CONSENT_REJECTED",
    userId,
    actor,
    actorRole,
    pass: false,
    details: {
      consentId: consent.id,
      consentType,
      purpose,
    },
  });

  return consent;
}

/**
 * Validates whether an active, valid consent exists for a specific user and purpose.
 */
async function validateActiveConsent({ userId, consentType, requiredPurpose = null }) {
  if (!userId || !consentType) {
    return { valid: false, code: "AA_CONSENT_REQUIRED", message: "User ID and consent type required" };
  }

  const consent = await ConsentRecord.findOne({
    userId,
    consentType,
    status: { $in: ["GRANTED", "ACTIVE"] },
  }).sort({ createdAt: -1 });

  if (!consent) {
    // Check if it was revoked
    const revoked = await ConsentRecord.findOne({ userId, consentType, status: "REVOKED" }).sort({ createdAt: -1 });
    if (revoked) {
      return { valid: false, code: "AA_CONSENT_REVOKED", message: "Consent has been revoked by the user" };
    }
    return { valid: false, code: "AA_CONSENT_REQUIRED", message: "Active consent record not found" };
  }

  // Check expiry
  if (consent.expiresAt && new Date(consent.expiresAt) < new Date()) {
    consent.status = "EXPIRED";
    await consent.save();
    return { valid: false, code: "AA_CONSENT_EXPIRED", message: "Consent validity window has expired" };
  }

  // Check purpose limitation if required
  if (requiredPurpose && consent.purpose && !consent.purpose.toLowerCase().includes(requiredPurpose.toLowerCase())) {
    return {
      valid: false,
      code: "AA_PURPOSE_NOT_AUTHORIZED",
      message: `Consent is authorized for '${consent.purpose}', not for '${requiredPurpose}'`,
    };
  }

  return { valid: true, consent };
}

/**
 * Computes an aggregated consent summary for the consumer dashboard and loan gates.
 */
async function getConsentSummary(userId) {
  if (!userId) return { activeCount: 0, items: [] };

  const consents = await ConsentRecord.find({ userId }).sort({ createdAt: -1 });
  const activeConsents = consents.filter((c) => (c.status === "GRANTED" || c.status === "ACTIVE") && new Date(c.expiresAt) >= new Date());

  const categoryStatuses = CONSENT_DEFINITIONS.map((def) => {
    const active = activeConsents.find((c) => c.consentType === def.type);
    return {
      type: def.type,
      title: def.title,
      categoryLabel: def.categoryLabel,
      dataCategory: def.dataCategory,
      purpose: def.purpose,
      status: active ? "ACTIVE" : "NOT_GRANTED",
      consentId: active?.id || null,
      grantedAt: active?.grantedAt || null,
      expiresAt: active?.expiresAt || null,
      version: active?.consentVersion || def.version,
    };
  });

  return {
    userId,
    activeCount: activeConsents.length,
    totalDefined: CONSENT_DEFINITIONS.length,
    overallStatus: activeConsents.length >= 3 ? "COMPLIANT" : "PARTIAL",
    isAaActive: Boolean(activeConsents.find((c) => c.consentType === "AA_FINANCIAL_DATA" || c.consentType === "AA_DATA")),
    isBureauActive: Boolean(activeConsents.find((c) => c.consentType === "BUREAU_DATA" || c.consentType === "BUREAU_PULL")),
    isLenderActive: Boolean(activeConsents.find((c) => c.consentType === "LENDER_DATA_SHARING")),
    items: categoryStatuses,
  };
}

/**
 * Aggregates read-only compliance metrics for the Admin dashboard.
 */
async function getAdminConsentMetrics() {
  const [totalConsents, grantedCount, revokedCount, expiredCount, rejectedCount, byType] = await Promise.all([
    ConsentRecord.countDocuments(),
    ConsentRecord.countDocuments({ status: { $in: ["GRANTED", "ACTIVE"] } }),
    ConsentRecord.countDocuments({ status: "REVOKED" }),
    ConsentRecord.countDocuments({ status: "EXPIRED" }),
    ConsentRecord.countDocuments({ status: "REJECTED" }),
    ConsentRecord.aggregate([
      { $group: { _id: "$consentType", count: { $sum: 1 }, activeCount: { $sum: { $cond: [{ $in: ["$status", ["GRANTED", "ACTIVE"]] }, 1, 0] } } } },
    ]),
  ]);

  const aaConsentRate = totalConsents > 0 ? Math.round((grantedCount / totalConsents) * 100) : 100;

  return {
    totalConsents,
    grantedCount,
    revokedCount,
    expiredCount,
    rejectedCount,
    aaConsentRate,
    distributionByType: byType.map((b) => ({ type: b._id, total: b.count, active: b.activeCount })),
  };
}

module.exports = {
  CONSENT_DEFINITIONS,
  DEFAULT_CONSENT_VERSION,
  getConsentDefinitions,
  getUserConsents,
  grantConsent,
  grantBatchConsents,
  revokeConsent,
  rejectConsent,
  validateActiveConsent,
  getConsentSummary,
  getAdminConsentMetrics,
};
