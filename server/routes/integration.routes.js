const express = require("express");
const DLA = require("../models/DLA");
const LoanApplication = require("../models/LoanApplication");
const LoanIntent = require("../models/LoanIntent");
const LoanOffer = require("../models/LoanOffer");
const LenderProduct = require("../models/LenderProduct");
const ApplicationRoute = require("../models/ApplicationRoute");
const asyncHandler = require("../utils/asyncHandler");
const { validateApplication } = require("../middleware/validate");
const { nextApplicationId, nextOfferId } = require("../utils/idGenerator");
const { runCreditEngine } = require("../services/creditEngine");
const { generateKFS } = require("../services/kfsGenerator");
const { logCompliance } = require("../middleware/rbiCompliance");
const { idempotency } = require("../middleware/idempotency");
const { dispatchWebhook } = require("../services/webhookService");

const router = express.Router();

// Middleware: Authenticate DLA API key
async function authenticateDLAKey(req, res, next) {
  const apiKey = req.headers["x-api-key"] || (req.headers.authorization || "").replace("Bearer ", "");
  if (!apiKey) {
    return res.status(401).json({ error: "X-API-Key or Bearer token header required" });
  }

  const dla = await DLA.findOne({ apiKey, status: "ACTIVE" });
  if (!dla) {
    return res.status(401).json({ error: "Invalid or inactive DLA API Key" });
  }

  req.dla = dla;
  next();
}

router.use(authenticateDLAKey);
router.use(idempotency);

// 1. POST /api/v1/integrations/applications
router.post(
  "/applications",
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
      purpose: b.purpose.toLowerCase().replace(/\s+/g, "_"),
      tenure: b.tenure,
      cibilScore: b.cibilScore,
      monthlyIncome: b.monthlyIncome,
      monthlyObligations: b.monthlyObligations || 0,
      dlaId: req.dla.id,
      status: "SUBMITTED",
      aaConsent: true,
    });

    await logCompliance({
      type: "ELIGIBILITY_EVALUATED",
      applicationId: app.id,
      actor: req.dla.name,
      actorRole: "DLA",
      pass: true,
      details: { dlaId: req.dla.id },
    });

    dispatchWebhook({
      dlaId: req.dla.id,
      eventType: "application.created",
      resourceId: app.id,
      payload: { applicationId: app.id, dlaId: req.dla.id, status: app.status },
    });

    return res.status(201).json({ application: app, apiVersion: "v1" });
  })
);

// 2. GET /api/v1/integrations/applications/:id
router.get(
  "/applications/:id",
  asyncHandler(async (req, res) => {
    const app = await LoanApplication.findOne({ id: req.params.id, dlaId: req.dla.id });
    if (!app) return res.status(404).json({ error: "Application not found for this DLA" });
    return res.json({ application: app, apiVersion: "v1" });
  })
);

// 3. POST /api/v1/integrations/eligibility
router.post(
  "/eligibility",
  asyncHandler(async (req, res) => {
    const { amount, tenure, purpose, cibilScore, monthlyIncome, monthlyObligations } = req.body || {};
    if (!amount || !tenure || !cibilScore || !monthlyIncome) {
      return res.status(400).json({ error: "amount, tenure, cibilScore, monthlyIncome required" });
    }

    const lenders = (await LenderProduct.find({ active: true })).map((l) => l.toObject());
    const result = runCreditEngine(
      {
        amount: Number(amount),
        tenure: Number(tenure),
        purpose: String(purpose || "personal"),
        cibilScore: Number(cibilScore),
        monthlyIncome: Number(monthlyIncome),
        monthlyObligations: Number(monthlyObligations || 0),
      },
      lenders
    );

    return res.json({
      eligibleLenders: result.eligible,
      ineligibleLenders: result.rejected,
      dti: result.dti,
      apiVersion: "v1",
    });
  })
);

// 4. GET /api/v1/integrations/offers/:applicationId
router.get(
  "/offers/:applicationId",
  asyncHandler(async (req, res) => {
    const app = await LoanApplication.findOne({ id: req.params.applicationId, dlaId: req.dla.id });
    if (!app) return res.status(404).json({ error: "Application not found for this DLA" });

    const lenders = (await LenderProduct.find({ active: true })).map((l) => l.toObject());
    const match = runCreditEngine(app.toObject(), lenders);

    return res.json({
      applicationId: app.id,
      offers: match.eligible.map((item) => ({
        lenderId: item.lender.id,
        lenderName: item.lender.lenderName,
        lenderType: item.lender.type,
        amount: app.amount,
        interestRate: item.lender.interestRate,
        APR: item.apr,
        tenure: app.tenure,
        EMI: item.emi,
        processingFee: item.processingFee,
        totalRepayment: item.totalRepayment,
        disbursalTime: item.lender.disbursalTime,
        reasons: item.reasons,
      })),
      apiVersion: "v1",
    });
  })
);

// 5. POST /api/v1/integrations/offers/:offerId/select
router.post(
  "/offers/:offerId/select",
  asyncHandler(async (req, res) => {
    const { applicationId, lenderId } = req.body || {};
    const app = await LoanApplication.findOne({ id: applicationId, dlaId: req.dla.id });
    if (!app) return res.status(404).json({ error: "Application not found for this DLA" });

    const lender = await LenderProduct.findOne({ id: lenderId });
    if (!lender) return res.status(404).json({ error: "Lender product not found" });

    const kfsData = generateKFS(app.toObject(), lender.toObject());
    const route = await ApplicationRoute.findOneAndUpdate(
      { applicationId: app.id },
      {
        applicationId: app.id,
        lenderId: lender.id,
        score: 90,
        emi: kfsData.emi,
        totalPayable: kfsData.totalPayable,
        routedAt: new Date(),
        status: "pending",
        kfsData,
        rejectionReasons: [],
      },
      { upsert: true, new: true }
    );

    app.status = "ROUTED";
    app.routedTo = lender.id;
    app.routedAt = new Date();
    app.kfsGenerated = true;
    app.kfsPresentedAt = new Date();
    app.kfsAcceptedAt = new Date();
    await app.save();

    await logCompliance({
      type: "ROUTE_CREATED",
      applicationId: app.id,
      actor: req.dla.name,
      actorRole: "DLA",
      pass: true,
      newState: "ROUTED",
      details: { lenderId: lender.id },
    });

    dispatchWebhook({
      dlaId: req.dla.id,
      eventType: "loan.routed",
      resourceId: app.id,
      payload: { applicationId: app.id, lenderId: lender.id, status: "ROUTED" },
    });

    return res.json({ application: app, route, kfsData, apiVersion: "v1" });
  })
);

// 6. GET /api/v1/integrations/applications/:id/status
router.get(
  "/applications/:id/status",
  asyncHandler(async (req, res) => {
    const app = await LoanApplication.findOne({ id: req.params.id, dlaId: req.dla.id });
    if (!app) return res.status(404).json({ error: "Application not found" });

    const route = await ApplicationRoute.findOne({ applicationId: app.id });
    return res.json({
      id: app.id,
      status: app.status,
      routedTo: app.routedTo,
      routedAt: app.routedAt,
      kfsGenerated: app.kfsGenerated,
      rejectionReasonCode: app.rejectionReasonCode,
      declineExplanation: app.declineExplanation,
      kfs: route ? route.kfsData : null,
      apiVersion: "v1",
    });
  })
);

module.exports = router;
