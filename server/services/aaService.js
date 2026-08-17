// ── Account Aggregator Service (MOCK) ────────────────────────────
// Simulates AA (RBI-regulated) consent logging and bank-statement fetch.
// In production replace with the real AA API via an AA provider
// (Finvu / Sahamati ecosystem) or a Perfios-embedded AA flow.

const { AA_CONSENT_VALIDITY_DAYS } = require("../config/constants");
const ConsentRecord = require("../models/ConsentRecord");

function hashPan(pan) {
  let h = 0;
  for (const c of String(pan || "").toUpperCase()) {
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
  }
  return h;
}

// Log an AA consent with timestamp, version, and expiry window.
function logConsent({ pan, consentAt = new Date(), userId = null, purpose = "Credit assessment and bank statement analysis" }) {
  const expiresAt = new Date(consentAt);
  expiresAt.setDate(expiresAt.getDate() + (AA_CONSENT_VALIDITY_DAYS || 180));
  const consentId = "AA-" + hashPan(pan).toString(36).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
  return {
    consentId,
    id: consentId,
    pan: String(pan || "").toUpperCase(),
    userId,
    consentType: "AA_FINANCIAL_DATA",
    purpose,
    status: "GRANTED",
    version: "AA-CONSENT-v2.1",
    consentVersion: "AA-CONSENT-v2.1",
    consentedAt: consentAt.toISOString(),
    grantedAt: consentAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    aaProvider: "Finvu (MOCK)",
    provider: "Finvu (MOCK)",
    scope: ["BANK_ACCOUNTS", "CREDIT_INFORMATION"],
  };
}

// Fetch a mock bank statement summary with derived financial indicators (Data minimization).
function fetchBankStatement({ pan }) {
  const h = hashPan(pan);
  const baseCredit = 30000 + (h % 350000);
  return {
    pan: String(pan || "").toUpperCase(),
    statementMonths: 6,
    summary: {
      avgMonthlyCredit: baseCredit,
      avgBalance: Math.round(baseCredit * 0.28),
      bounceRate: Math.round(((h % 15) * 10) / 10), // 0.0 - 14.0 %
    },
    activeLoans: h % 4,
    provider: "Perfios (MOCK)",
    dataMinimizationNotice: "Raw transaction data pruned per DPDP Act 2023. Only derived credit indicators persisted.",
  };
}

module.exports = { logConsent, fetchBankStatement, hashPan };
