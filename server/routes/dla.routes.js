const express = require("express");
const LoanApplication = require("../models/LoanApplication");
const ApplicationRoute = require("../models/ApplicationRoute");
const BorrowerProfile = require("../models/BorrowerProfile");
const { authenticate, requireRole, canAccessApplication } = require("../middleware/auth");
const { validateApplication, isPan } = require("../middleware/validate");
const { nextApplicationId } = require("../utils/idGenerator");
const asyncHandler = require("../utils/asyncHandler");
const { logCompliance } = require("../middleware/rbiCompliance");
const bureauService = require("../services/bureauService");
const aaService = require("../services/aaService");

const router = express.Router();

// POST /api/applications  (DLA only)
// DLA submission. aaConsent must be true (enforced in validateApplication).
router.post(
  "/applications",
  authenticate,
  requireRole("DLA"),
  validateApplication,
  asyncHandler(async (req, res) => {
    const b = req.body;
    const appId = await nextApplicationId();

    const app = await LoanApplication.create({
      id: appId,
      borrowerName: b.borrowerName,
      pan: b.pan,
      mobile: b.mobile,
      amount: b.amount,
      purpose: b.purpose,
      tenure: b.tenure,
      cibilScore: b.cibilScore,
      monthlyIncome: b.monthlyIncome,
      monthlyObligations: b.monthlyObligations,
      dlaId: req.user.dlaId || b.dlaId || "DLA-001",
      status: "pending_review",
      aaConsent: true,
    });

    // AA consent is logged and a (mock) bank statement is fetched at submission.
    const consent = aaService.logConsent({ pan: b.pan });
    const statement = aaService.fetchBankStatement({ pan: b.pan });

    await logCompliance({
      type: "AA_CONSENT",
      applicationId: app.id,
      pass: true,
      details: { consentId: consent.consentId, expiresAt: consent.expiresAt },
    });

    await BorrowerProfile.findOneAndUpdate(
      { pan: b.pan },
      {
        $set: {
          name: b.borrowerName,
          mobile: b.mobile,
          cibilScore: b.cibilScore,
          cibilPulledAt: new Date(),
          aaConsentActive: true,
          aaConsentExpiry: new Date(consent.expiresAt),
          bankStatementSummary: statement.summary,
          activeLoans: statement.activeLoans,
          totalExistingEmi: b.monthlyObligations,
        },
      },
      { upsert: true }
    );

    return res.status(201).json(app);
  })
);

// GET /api/applications  (all roles, role-scoped)
// Query: ?status=<status>&dlaId=<dlaId> (dlaId filter is ADMIN only)
router.get(
  "/applications",
  authenticate,
  asyncHandler(async (req, res) => {
    const { status, dlaId } = req.query;
    const q = {};

    if (req.user.role === "DLA") q.dlaId = req.user.dlaId;
    else if (req.user.role === "LENDER") q.routedTo = req.user.lenderId;
    else if (dlaId) q.dlaId = dlaId;

    if (status) q.status = status;

    const apps = await LoanApplication.find(q).sort({ createdAt: -1 });
    return res.json(apps);
  })
);

// GET /api/applications/:id  (all roles, role-scoped)
router.get(
  "/applications/:id",
  authenticate,
  canAccessApplication,
  (req, res) => res.json(req.application)
);

// GET /api/applications/:id/kfs  (all roles, role-scoped)
router.get(
  "/applications/:id/kfs",
  authenticate,
  canAccessApplication,
  asyncHandler(async (req, res) => {
    const route = await ApplicationRoute.findOne({
      applicationId: req.application.id,
    });
    if (!route || !route.kfsData) {
      return res.status(404).json({ error: "No KFS generated for this application yet" });
    }
    return res.json(route.kfsData);
  })
);

// POST /api/bureau/pull  (DLA only)
// Body: { pan }  ->  mock CIBIL pull
router.post(
  "/bureau/pull",
  authenticate,
  requireRole("DLA"),
  asyncHandler(async (req, res) => {
    const pan = String((req.body || {}).pan || "").toUpperCase();
    if (!isPan(pan)) {
      return res.status(400).json({ error: "Invalid PAN format" });
    }
    const result = bureauService.pullCibil(pan);
    await BorrowerProfile.updateOne(
      { pan },
      { $set: { cibilScore: result.cibilScore, cibilPulledAt: new Date(result.pulledAt) } },
      { upsert: true }
    );
    await logCompliance({
      type: "BUREAU_PULL",
      applicationId: null,
      pass: true,
      details: { pan, cibilScore: result.cibilScore },
    });
    return res.json(result);
  })
);

const ConsentRecord = require("../models/ConsentRecord");
const consentService = require("../services/consent.service");

// POST /api/aa/consent  (DLA / Consumer)
// Logs purpose-specific AA consent with timestamp. Body: { pan, purpose, dataCategory }
router.post(
  "/aa/consent",
  authenticate,
  asyncHandler(async (req, res) => {
    const pan = String((req.body || {}).pan || "").toUpperCase();
    if (!isPan(pan)) {
      return res.status(400).json({ error: "Invalid PAN format" });
    }

    const { purpose = "Credit assessment and bank statement analysis", dataCategory = "FINANCIAL_DATA" } = req.body || {};
    const consent = aaService.logConsent({ pan, consentAt: new Date(), purpose });

    await BorrowerProfile.updateOne(
      { pan },
      { $set: { aaConsentActive: true, aaConsentExpiry: new Date(consent.expiresAt) } },
      { upsert: true }
    );

    // Also persist structured ConsentRecord
    const userIdKey = req.user?.userId || req.user?.sub || `DLA-${pan}`;
    await ConsentRecord.create({
      id: consent.id,
      userId: userIdKey,
      consentType: "AA_FINANCIAL_DATA",
      purpose,
      dataCategory,
      requestedBy: req.user.dlaId || req.user.username || "DLA",
      provider: "Finvu (MOCK)",
      status: "GRANTED",
      consentVersion: "AA-CONSENT-v2.1",
      version: "AA-CONSENT-v2.1",
      grantedAt: new Date(),
      expiresAt: new Date(consent.expiresAt),
      source: "DLA_AA_CONSENT_FLOW",
      metadata: { pan },
    });

    await logCompliance({
      type: "CONSENT_GRANTED",
      userId: userIdKey,
      actor: req.user.username,
      actorRole: req.user.role,
      pass: true,
      details: { consentId: consent.id, pan, type: "AA_FINANCIAL_DATA", purpose },
    });

    return res.json(consent);
  })
);

// POST /api/aa/fetch  (DLA / Consumer)
// Returns mock bank statement data only when an active, valid, non-revoked AA consent exists.
router.post(
  "/aa/fetch",
  authenticate,
  asyncHandler(async (req, res) => {
    const pan = String((req.body || {}).pan || "").toUpperCase();
    if (!isPan(pan)) {
      return res.status(400).json({ error: "Invalid PAN format" });
    }

    const requestedPurpose = String(req.body.purpose || "CREDIT_ASSESSMENT");

    // Check borrower profile consent flag and ConsentRecord
    const profile = await BorrowerProfile.findOne({ pan });
    const consentRecord = await ConsentRecord.findOne({
      $or: [{ "metadata.pan": pan }, { userId: req.user?.userId || req.user?.sub }],
      consentType: { $in: ["AA_FINANCIAL_DATA", "AA_DATA"] },
    }).sort({ createdAt: -1 });

    // Validate consent existence & status
    if (consentRecord) {
      if (consentRecord.status === "REVOKED") {
        await logCompliance({
          type: "AA_DATA_ACCESS_DENIED",
          actor: req.user.username,
          actorRole: req.user.role,
          pass: false,
          details: { pan, reason: "Consent Revoked", consentId: consentRecord.id },
        });
        return res.status(403).json({
          error: "AA_CONSENT_REVOKED",
          message: "Account Aggregator financial data access denied: Consent has been revoked by the borrower.",
        });
      }

      if (consentRecord.expiresAt && new Date(consentRecord.expiresAt) < new Date()) {
        await logCompliance({
          type: "AA_DATA_ACCESS_DENIED",
          actor: req.user.username,
          actorRole: req.user.role,
          pass: false,
          details: { pan, reason: "Consent Expired", consentId: consentRecord.id },
        });
        return res.status(403).json({
          error: "AA_CONSENT_EXPIRED",
          message: "Account Aggregator financial data access denied: Consent validity has expired.",
        });
      }

      if (requestedPurpose && requestedPurpose !== "CREDIT_ASSESSMENT" && consentRecord.purpose && !consentRecord.purpose.toLowerCase().includes(requestedPurpose.toLowerCase())) {
        await logCompliance({
          type: "PURPOSE_MISMATCH",
          actor: req.user.username,
          actorRole: req.user.role,
          pass: false,
          details: { pan, requestedPurpose, authorizedPurpose: consentRecord.purpose },
        });
        return res.status(403).json({
          error: "AA_PURPOSE_NOT_AUTHORIZED",
          message: `Access denied: Requested purpose '${requestedPurpose}' is not authorized under this consent.`,
        });
      }
    } else if (!profile || !profile.aaConsentActive || (profile.aaConsentExpiry && new Date(profile.aaConsentExpiry) < new Date())) {
      await logCompliance({
        type: "AA_DATA_ACCESS_DENIED",
        actor: req.user.username,
        actorRole: req.user.role,
        pass: false,
        details: { pan, reason: "No Active Consent" },
      });
      return res.status(403).json({
        error: "AA_CONSENT_REQUIRED",
        message: "Account Aggregator data access denied: No active consent found for this borrower.",
      });
    }

    const statement = aaService.fetchBankStatement({ pan });

    await logCompliance({
      type: "AA_DATA_FETCHED",
      actor: req.user.username,
      actorRole: req.user.role,
      pass: true,
      details: { pan, statementMonths: statement.statementMonths, provider: statement.provider },
    });

    return res.json(statement);
  })
);

module.exports = router;

