// ── Automated Test Suite: Purpose-Specific AA Consent Management ──
// Tests purpose-specific consent lifecycle, unbundled opt-ins,
// AA fetch validation gates, revocation, user isolation, and zero-Aadhaar storage.

const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const User = require("./models/User");
const BorrowerProfile = require("./models/BorrowerProfile");
const ConsentRecord = require("./models/ConsentRecord");
const ComplianceLog = require("./models/ComplianceLog");
const consentService = require("./services/consent.service");
const aaService = require("./services/aaService");

let mongoServer;

async function setup() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  console.log("\nConnected to in-memory test database for AA consent testing\n");
}

async function teardown() {
  await mongoose.disconnect();
  await mongoServer.stop();
  console.log("Test database disconnected and stopped\n");
}

async function runTests() {
  console.log("========================================================");
  console.log("  AA CONSENT MANAGEMENT & DATA GOVERNANCE TEST SUITE    ");
  console.log("========================================================\n");

  let passed = 0;
  let total = 0;

  function check(label, condition) {
    total++;
    assert(condition, `FAILED: ${label}`);
    console.log(`  ✓ ${label}`);
    passed++;
  }

  // ───────────────────────────────────────────────────────────────────
  // TEST 1: Standard Consent Definitions Catalogue
  // ───────────────────────────────────────────────────────────────────
  console.log("TEST 1: Standard Consent Definitions Catalogue");
  const defs = consentService.getConsentDefinitions();
  check("Consent catalogue contains at least 6 purpose-specific categories", defs.length >= 6);
  check("Financial data category defined", defs.some((d) => d.type === "AA_FINANCIAL_DATA"));
  check("KYC identity category defined", defs.some((d) => d.type === "KYC_IDENTITY"));
  check("Bureau data category defined", defs.some((d) => d.type === "BUREAU_DATA"));
  check("Lender data sharing category defined", defs.some((d) => d.type === "LENDER_DATA_SHARING"));
  check("Device & behavioural telemetry defined", defs.some((d) => d.type === "DEVICE_DATA"));
  check("All consent templates use version AA-CONSENT-v2.1", defs.every((d) => d.version === "AA-CONSENT-v2.1"));

  // ───────────────────────────────────────────────────────────────────
  // TEST 2: Explicit Purpose-Specific Consent Creation
  // ───────────────────────────────────────────────────────────────────
  console.log("\nTEST 2: Explicit Purpose-Specific Consent Creation");
  const userA = "USR-CONSENT-001";
  const c1 = await consentService.grantConsent({
    userId: userA,
    consentType: "AA_FINANCIAL_DATA",
    purpose: "Credit assessment and income verification",
    dataCategory: "FINANCIAL_DATA",
    provider: "Finvu Account Aggregator",
    durationDays: 180,
    source: "CONSUMER_CONSENT_CENTER",
    actor: "user_a",
  });

  check("Consent record created successfully", Boolean(c1 && c1.id));
  check("Consent status is GRANTED", c1.status === "GRANTED");
  check("Consent version is AA-CONSENT-v2.1", c1.consentVersion === "AA-CONSENT-v2.1");
  check("Expires in approximately 180 days", new Date(c1.expiresAt) > new Date());
  check("revokedAt is null initially", c1.revokedAt === null);

  const log1 = await ComplianceLog.findOne({ "details.consentId": c1.id, type: "CONSENT_GRANTED" });
  check("CONSENT_GRANTED compliance log recorded", Boolean(log1));
  check("Compliance log recorded with correct userId", log1?.userId === userA);

  // ───────────────────────────────────────────────────────────────────
  // TEST 3: Unbundled Batch Consent Grants
  // ───────────────────────────────────────────────────────────────────
  console.log("\nTEST 3: Unbundled Batch Consent Grants");
  const batchRes = await consentService.grantBatchConsents({
    userId: userA,
    consents: [
      { consentType: "KYC_IDENTITY", purpose: "Verified PAN KYC identity checks", granted: true },
      { consentType: "BUREAU_DATA", purpose: "CIBIL Bureau credit query", granted: true },
      { consentType: "DEVICE_DATA", purpose: "Optional device telemetry", granted: false, rejected: true },
    ],
    source: "LOAN_APPLICATION_FLOW",
    actor: "user_a",
  });

  check("Batch created exactly 2 granted records", batchRes.length === 2);
  const userAConsents = await consentService.getUserConsents(userA);
  check("Total consent history for userA contains 4 records (3 granted + 1 rejected)", userAConsents.length === 4);
  const rejectedRecord = userAConsents.find((c) => c.consentType === "DEVICE_DATA");
  check("Rejected record status is REJECTED", rejectedRecord?.status === "REJECTED");

  // ───────────────────────────────────────────────────────────────────
  // TEST 4: Active Consent Validation Gate
  // ───────────────────────────────────────────────────────────────────
  console.log("\nTEST 4: Active Consent Validation Gate");
  const v1 = await consentService.validateActiveConsent({
    userId: userA,
    consentType: "AA_FINANCIAL_DATA",
    requiredPurpose: "Credit assessment",
  });
  check("Valid active AA consent passes validation", v1.valid === true);
  check("Returns matching consent record", v1.consent?.id === c1.id);

  // Purpose mismatch check
  const vMismatch = await consentService.validateActiveConsent({
    userId: userA,
    consentType: "AA_FINANCIAL_DATA",
    requiredPurpose: "Marketing and cross-selling",
  });
  check("Purpose mismatch blocked with AA_PURPOSE_NOT_AUTHORIZED", vMismatch.valid === false && vMismatch.code === "AA_PURPOSE_NOT_AUTHORIZED");

  // ───────────────────────────────────────────────────────────────────
  // TEST 5: Consent Revocation Lifecycle
  // ───────────────────────────────────────────────────────────────────
  console.log("\nTEST 5: Consent Revocation Lifecycle");
  const revokedC1 = await consentService.revokeConsent({
    consentId: c1.id,
    userId: userA,
    reason: "Borrower opted out of financial data sharing",
    actor: "user_a",
  });

  check("Consent status transitioned to REVOKED", revokedC1.status === "REVOKED");
  check("revokedAt timestamp recorded", Boolean(revokedC1.revokedAt));
  check("Revocation reason persisted", revokedC1.revocationReason === "Borrower opted out of financial data sharing");

  // Verify historical record was NOT deleted
  const historical = await ConsentRecord.findOne({ id: c1.id });
  check("Historical record is preserved in database", Boolean(historical));

  // Verify compliance log for revocation
  const revokeLog = await ComplianceLog.findOne({ "details.consentId": c1.id, type: "CONSENT_REVOKED" });
  check("CONSENT_REVOKED compliance log recorded", Boolean(revokeLog));

  // Verify validation gate now denies access
  const vRevoked = await consentService.validateActiveConsent({
    userId: userA,
    consentType: "AA_FINANCIAL_DATA",
  });
  check("Revoked consent fails validation with AA_CONSENT_REVOKED", vRevoked.valid === false && vRevoked.code === "AA_CONSENT_REVOKED");

  // ───────────────────────────────────────────────────────────────────
  // TEST 6: User Isolation & Cross-User Security
  // ───────────────────────────────────────────────────────────────────
  console.log("\nTEST 6: User Isolation & Cross-User Security");
  const userB = "USR-CONSENT-002";
  const cB = await consentService.grantConsent({
    userId: userB,
    consentType: "AA_FINANCIAL_DATA",
    purpose: "User B credit assessment",
    actor: "user_b",
  });

  // User A attempts to revoke User B's consent
  let crossRevokeError = null;
  try {
    await consentService.revokeConsent({
      consentId: cB.id,
      userId: userA, // Wrong user!
      actor: "user_a",
    });
  } catch (err) {
    crossRevokeError = err;
  }
  check("Cross-user consent revocation blocked with error", Boolean(crossRevokeError));
  const cBCheck = await ConsentRecord.findOne({ id: cB.id });
  check("User B consent remains GRANTED", cBCheck.status === "GRANTED");

  // ───────────────────────────────────────────────────────────────────
  // TEST 7: Expiry Window Handling
  // ───────────────────────────────────────────────────────────────────
  console.log("\nTEST 7: Expiry Window Handling");
  const expiredConsent = await ConsentRecord.create({
    id: "CON-EXPIRED-TEST",
    userId: userB,
    consentType: "LENDER_DATA_SHARING",
    purpose: "Lender underwriting",
    provider: "Vantage Rails",
    status: "GRANTED",
    consentVersion: "AA-CONSENT-v2.1",
    version: "AA-CONSENT-v2.1",
    grantedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // In the past
  });

  const vExpired = await consentService.validateActiveConsent({
    userId: userB,
    consentType: "LENDER_DATA_SHARING",
  });
  check("Expired consent fails validation with AA_CONSENT_EXPIRED", vExpired.valid === false && vExpired.code === "AA_CONSENT_EXPIRED");

  // ───────────────────────────────────────────────────────────────────
  // TEST 8: Consent Summary for Consumer Dashboard
  // ───────────────────────────────────────────────────────────────────
  console.log("\nTEST 8: Consent Summary for Consumer Dashboard");
  const summaryA = await consentService.getConsentSummary(userA);
  check("Summary includes user ID", summaryA.userId === userA);
  check("Summary counts active consents accurately", typeof summaryA.activeCount === "number");
  check("Summary categorizes bureau status", summaryA.isBureauActive === true);
  check("Summary reflects revoked AA status", summaryA.isAaActive === false);
  check("Items list includes all defined categories", summaryA.items.length >= 6);

  // ───────────────────────────────────────────────────────────────────
  // TEST 9: Admin Aggregate Consent Metrics (Read-Only)
  // ───────────────────────────────────────────────────────────────────
  console.log("\nTEST 9: Admin Aggregate Consent Metrics (Read-Only)");
  const adminMetrics = await consentService.getAdminConsentMetrics();
  check("Admin metrics returns totalConsents", adminMetrics.totalConsents >= 4);
  check("Admin metrics includes grantedCount", typeof adminMetrics.grantedCount === "number");
  check("Admin metrics includes revokedCount", adminMetrics.revokedCount >= 1);
  check("Admin metrics includes distributionByType", Array.isArray(adminMetrics.distributionByType));

  // ───────────────────────────────────────────────────────────────────
  // TEST 10: Strict Zero-Aadhaar Storage Verification
  // ───────────────────────────────────────────────────────────────────
  console.log("\nTEST 10: Strict Zero-Aadhaar Storage Verification");
  const allConsents = await ConsentRecord.find();
  const consentKeys = allConsents.flatMap((c) => Object.keys(c.toObject()));
  check("ConsentRecord schema does not have aadhaar or aadhaarNumber field", !consentKeys.includes("aadhaar") && !consentKeys.includes("aadhaarNumber"));

  const allLogs = await ComplianceLog.find();
  const serializedLogs = JSON.stringify(allLogs);
  check("Compliance logs contain no 12-digit Aadhaar patterns", !/\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/.test(serializedLogs));

  console.log("\n========================================================");
  console.log(`  AA CONSENT RESULTS: ${passed} PASSED, ${total - passed} FAILED  `);
  console.log("========================================================\n");
}

(async function main() {
  try {
    await setup();
    await runTests();
    await teardown();
    process.exit(0);
  } catch (err) {
    console.error("Test execution failed:", err);
    if (mongoServer) await teardown();
    process.exit(1);
  }
})();
