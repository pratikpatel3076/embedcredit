const express = require("express");
const LenderProduct = require("../models/LenderProduct");
const ApplicationRoute = require("../models/ApplicationRoute");
const { authenticate, requireRole, canAccessApplication } = require("../middleware/auth");
const { kfsBeforeDisbursal, getLenderPortfolio, FLDG_CAP } = require("../middleware/rbiCompliance");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// GET /api/lenders  (all authenticated roles)
// Full lender product catalogue.
router.get(
  "/lenders",
  authenticate,
  asyncHandler(async (req, res) => {
    const lenders = await LenderProduct.find().sort({ id: 1 });
    return res.json(lenders);
  })
);

// GET /api/lenders/:id/portfolio  (LENDER own / ADMIN)
// Portfolio stats + FLDG exposure calculation for a lender.
router.get(
  "/lenders/:id/portfolio",
  authenticate,
  requireRole("LENDER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const lender = await LenderProduct.findOne({ id: req.params.id });
    if (!lender) return res.status(404).json({ error: "Lender product not found" });
    if (req.user.role === "LENDER" && req.user.lenderId !== lender.id) {
      return res.status(403).json({ error: "Not authorized to view this lender's portfolio" });
    }

    const { portfolioValue, disbursedValue, applicationCount } = await getLenderPortfolio(lender.id);
    const fldgExposure = FLDG_CAP * disbursedValue;
    const capLimit = FLDG_CAP * portfolioValue;

    return res.json({
      lender,
      portfolioValue,
      disbursedValue,
      applicationCount,
      fldgExposure,
      fldgCap: FLDG_CAP,
      capLimit,
      utilizationPct: capLimit > 0 ? Math.min(100, Math.round((fldgExposure / capLimit) * 100)) : 0,
    });
  })
);

const { logCompliance } = require("../middleware/rbiCompliance");
const { dispatchWebhook } = require("../services/webhookService");

// POST /api/applications/:id/approve  (LENDER ONLY — ADMIN is forbidden)
router.post(
  "/applications/:id/approve",
  authenticate,
  requireRole("LENDER"),
  canAccessApplication,
  asyncHandler(async (req, res) => {
    const app = req.application;
    if (req.user.role !== "LENDER" || app.routedTo !== req.user.lenderId) {
      return res.status(403).json({ error: "Only the assigned lending partner can approve this loan" });
    }

    const prev = app.status;
    app.status = "APPROVED";
    await app.save();

    await ApplicationRoute.updateOne(
      { applicationId: app.id },
      { $set: { status: "accepted" } }
    );

    await logCompliance({
      type: "LENDER_APPROVED",
      applicationId: app.id,
      userId: app.userId,
      actor: req.user.username,
      actorRole: req.user.role,
      pass: true,
      previousState: prev,
      newState: "APPROVED",
      details: { lenderId: req.user.lenderId },
    });

    dispatchWebhook({
      dlaId: app.dlaId,
      eventType: "loan.approved",
      resourceId: app.id,
      payload: { applicationId: app.id, status: "APPROVED", lenderId: req.user.lenderId },
    });

    return res.json({ application: app, message: "Loan application approved by lender." });
  })
);

// POST /api/applications/:id/reject  (LENDER ONLY — ADMIN is forbidden)
// Body: { rejectionReasonCode, rejectionReasonText }
router.post(
  "/applications/:id/reject",
  authenticate,
  requireRole("LENDER"),
  canAccessApplication,
  asyncHandler(async (req, res) => {
    const app = req.application;
    if (req.user.role !== "LENDER" || app.routedTo !== req.user.lenderId) {
      return res.status(403).json({ error: "Only the assigned lending partner can reject this loan" });
    }

    const { rejectionReasonCode, rejectionReasonText } = req.body || {};
    const validCodes = [
      "INSUFFICIENT_INCOME",
      "CREDIT_CRITERIA_NOT_MET",
      "HIGH_OBLIGATIONS",
      "DOCUMENTATION_ISSUE",
      "PRODUCT_UNAVAILABLE",
      "OTHER",
    ];

    if (!rejectionReasonCode || !validCodes.includes(rejectionReasonCode)) {
      return res.status(400).json({
        error: "Valid rejectionReasonCode is required",
        allowedCodes: validCodes,
      });
    }

    const consumerExplanations = {
      INSUFFICIENT_INCOME: "The minimum net monthly income criteria specified by the lender was not met.",
      CREDIT_CRITERIA_NOT_MET: "The credit bureau profile or score did not meet the lender's risk parameters.",
      HIGH_OBLIGATIONS: "Existing monthly financial obligations relative to income exceed lender leverage caps.",
      DOCUMENTATION_ISSUE: "Submitted income or identity documentation could not be verified by the lender.",
      PRODUCT_UNAVAILABLE: "The requested loan product or tenure tier is currently unavailable from the lender.",
      OTHER: "The application did not satisfy the lender's underwriting guidelines.",
    };

    const prev = app.status;
    app.status = "REJECTED";
    app.rejectionReasonCode = rejectionReasonCode;
    app.rejectionReasonText = rejectionReasonText || "";
    app.declineExplanation = consumerExplanations[rejectionReasonCode] || consumerExplanations.OTHER;
    await app.save();

    await ApplicationRoute.updateOne(
      { applicationId: app.id },
      { $set: { status: "rejected", rejectionReasons: [app.declineExplanation] } }
    );

    await logCompliance({
      type: "LENDER_REJECTED",
      applicationId: app.id,
      userId: app.userId,
      actor: req.user.username,
      actorRole: req.user.role,
      pass: true,
      previousState: prev,
      newState: "REJECTED",
      details: { lenderId: req.user.lenderId, rejectionReasonCode, declineExplanation: app.declineExplanation },
    });

    dispatchWebhook({
      dlaId: app.dlaId,
      eventType: "loan.rejected",
      resourceId: app.id,
      payload: { applicationId: app.id, status: "REJECTED", reason: app.declineExplanation },
    });

    return res.json({ application: app, message: "Loan application rejected." });
  })
);

// POST /api/applications/:id/disburse  (LENDER ONLY — ADMIN is forbidden)
router.post(
  "/applications/:id/disburse",
  authenticate,
  requireRole("LENDER"),
  canAccessApplication,
  kfsBeforeDisbursal,
  asyncHandler(async (req, res) => {
    const app = req.application;
    if (req.user.role !== "LENDER" || app.routedTo !== req.user.lenderId) {
      return res.status(403).json({ error: "Only the assigned lending partner can record disbursal for this loan" });
    }

    const prev = app.status;
    app.status = "disbursed";
    await app.save();

    await ApplicationRoute.updateOne(
      { applicationId: app.id },
      { $set: { status: "disbursed" } }
    );

    await logCompliance({
      type: "DISBURSAL_RECORDED",
      applicationId: app.id,
      userId: app.userId,
      actor: req.user.username,
      actorRole: req.user.role,
      pass: true,
      previousState: prev,
      newState: "disbursed",
      details: { amount: app.amount, lenderId: req.user.lenderId },
    });

    dispatchWebhook({
      dlaId: app.dlaId,
      eventType: "loan.disbursed",
      resourceId: app.id,
      payload: { applicationId: app.id, amount: app.amount, lenderId: req.user.lenderId },
    });

    return res.json({
      application: app,
      message: "Disbursal recorded. Funds flow directly from lender to borrower — the marketplace never touches money.",
    });
  })
);

module.exports = router;
