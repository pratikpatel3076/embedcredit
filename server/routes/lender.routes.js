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

// POST /api/applications/:id/disburse  (LENDER / ADMIN)
// Lender callback marking disbursal. Gates: application must be routed with a
// KFS generated (kfsBeforeDisbursal). Funds flow lender->borrower directly;
// this endpoint only records the state change.
router.post(
  "/applications/:id/disburse",
  authenticate,
  requireRole("LENDER", "ADMIN"),
  canAccessApplication,
  kfsBeforeDisbursal,
  asyncHandler(async (req, res) => {
    const app = req.application;
    app.status = "disbursed";
    await app.save();

    await ApplicationRoute.updateOne(
      { applicationId: app.id },
      { $set: { status: "disbursed" } }
    );

    return res.json({
      application: app,
      message: "Disbursal recorded. Funds flow directly from lender to borrower — the marketplace never touches money.",
    });
  })
);

module.exports = router;
