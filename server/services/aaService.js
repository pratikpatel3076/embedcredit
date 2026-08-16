// ── Account Aggregator Service (MOCK) ────────────────────────────
// Simulates AA (RBI-regulated) consent logging and bank-statement fetch.
// In production replace with the real AA API via an AA provider
// (Finvu / Sahamati ecosystem) or a Perfios-embedded AA flow.

const { AA_CONSENT_VALIDITY_DAYS } = require("../config/constants");

function hashPan(pan) {
  let h = 0;
  for (const c of pan) {
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
  }
  return h;
}

// Log an AA consent with timestamp and expiry window.
function logConsent({ pan, consentAt = new Date() }) {
  const expiresAt = new Date(consentAt);
  expiresAt.setDate(expiresAt.getDate() + AA_CONSENT_VALIDITY_DAYS);
  return {
    consentId: "AA-" + hashPan(pan).toString(36).toUpperCase() + "-" + Date.now().toString(36).toUpperCase(),
    pan: pan.toUpperCase(),
    status: "GRANTED",
    consentedAt: consentAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    aaProvider: "Finvu (MOCK)",
    scope: ["BANK_ACCOUNTS", "CREDIT_INFORMATION"],
  };
}

// Fetch a mock bank statement summary. Deterministic per PAN.
function fetchBankStatement({ pan }) {
  const h = hashPan(pan.toUpperCase());
  const baseCredit = 30000 + (h % 350000);
  return {
    pan: pan.toUpperCase(),
    statementMonths: 6,
    summary: {
      avgMonthlyCredit: baseCredit,
      avgBalance: Math.round(baseCredit * 0.28),
      bounceRate: Math.round(((h % 15) * 10) / 10), // 0.0 - 14.0 %
    },
    activeLoans: h % 4,
    provider: "Perfios (MOCK)",
  };
}

module.exports = { logConsent, fetchBankStatement };
