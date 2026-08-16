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

// POST /api/applications  (DLA / ADMIN)
// DLA submission. aaConsent must be true (enforced in validateApplication).
router.post(
  "/applications",
  authenticate,
  requireRole("DLA", "ADMIN"),
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

// POST /api/bureau/pull  (DLA / ADMIN)
// Body: { pan }  ->  mock CIBIL pull
router.post(
  "/bureau/pull",
  authenticate,
  requireRole("DLA", "ADMIN"),
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

// POST /api/aa/consent  (DLA / ADMIN)
// Logs AA consent with timestamp. Body: { pan }
router.post(
  "/aa/consent",
  authenticate,
  requireRole("DLA", "ADMIN"),
  asyncHandler(async (req, res) => {
    const pan = String((req.body || {}).pan || "").toUpperCase();
    if (!isPan(pan)) {
      return res.status(400).json({ error: "Invalid PAN format" });
    }
    const consent = aaService.logConsent({ pan, consentAt: new Date() });
    await BorrowerProfile.updateOne(
      { pan },
      { $set: { aaConsentActive: true, aaConsentExpiry: new Date(consent.expiresAt) } },
      { upsert: true }
    );
    return res.json(consent);
  })
);

// POST /api/aa/fetch  (DLA / ADMIN)
// Returns mock bank statement data. Body: { pan }
router.post(
  "/aa/fetch",
  authenticate,
  requireRole("DLA", "ADMIN"),
  asyncHandler(async (req, res) => {
    const pan = String((req.body || {}).pan || "").toUpperCase();
    if (!isPan(pan)) {
      return res.status(400).json({ error: "Invalid PAN format" });
    }
    const statement = aaService.fetchBankStatement({ pan });
    return res.json(statement);
  })
);

module.exports = router;
