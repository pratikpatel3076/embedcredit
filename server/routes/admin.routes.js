const express = require("express");
const LenderProduct = require("../models/LenderProduct");
const LoanApplication = require("../models/LoanApplication");
const ComplianceLog = require("../models/ComplianceLog");
const { authenticate, requireRole } = require("../middleware/auth");
const { validateLender } = require("../middleware/validate");
const { nextLenderId } = require("../utils/idGenerator");
const { getLenderPortfolio, FLDG_CAP } = require("../middleware/rbiCompliance");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// POST /api/lenders  (ADMIN only)
// Onboard a new lender product.
router.post(
  "/lenders",
  authenticate,
  requireRole("ADMIN"),
  validateLender,
  asyncHandler(async (req, res) => {
    const b = req.body;
    const lenderId = await nextLenderId();
    const lender = await LenderProduct.create({
      id: lenderId,
      lenderName: b.lenderName,
      type: b.type,
      minAmount: Number(b.minAmount),
      maxAmount: Number(b.maxAmount),
      interestRate: Number(b.interestRate),
      tenureMonths: b.tenureMonths.map(Number),
      minCibilScore: Number(b.minCibilScore),
      maxDti: Number(b.maxDti),
      processingFee: Number(b.processingFee || 0),
      disbursalTime: b.disbursalTime || "T+1",
      supportedPurposes: b.supportedPurposes,
      ocenEnabled: Boolean(b.ocenEnabled),
      aaEnabled: Boolean(b.aaEnabled),
      nachEnabled: Boolean(b.nachEnabled),
    });
    return res.status(201).json(lender);
  })
);

// GET /api/admin/stats  (ADMIN only)
router.get(
  "/admin/stats",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const all = await LoanApplication.find().sort({ createdAt: -1 });
    const total = all.length;
    const routed = all.filter((a) => a.status === "routed").length;
    const disbursed = all.filter((a) => a.status === "disbursed").length;
    const pending = all.filter((a) => a.status === "pending_review").length;
    const rejected = all.filter((a) => a.status === "rejected").length;
    const volume = all.filter((a) => a.status === "disbursed").reduce((s, a) => s + a.amount, 0);
    const avgCibil = total ? Math.round(all.reduce((s, a) => s + a.cibilScore, 0) / total) : 0;

    return res.json({
      total,
      routed,
      disbursed,
      pending,
      rejected,
      volume,
      avgCibil,
      recent: all.slice(0, 10),
    });
  })
);

// GET /api/admin/compliance  (ADMIN only)
// FLDG cap status per lender + KFS compliance rate + compliance log failures.
router.get(
  "/admin/compliance",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const lenders = await LenderProduct.find().sort({ id: 1 });
    const activeApps = await LoanApplication.find({
      status: { $in: ["routed", "disbursed"] },
    });

    const lenderRows = [];
    for (const l of lenders) {
      const owned = activeApps.filter((a) => a.routedTo === l.id);
      const portfolioValue = owned.reduce((s, a) => s + a.amount, 0);
      const disbursedValue = owned
        .filter((a) => a.status === "disbursed")
        .reduce((s, a) => s + a.amount, 0);
      const fldgExposure = FLDG_CAP * disbursedValue;
      const capLimit = FLDG_CAP * portfolioValue;
      lenderRows.push({
        lenderId: l.id,
        lenderName: l.lenderName,
        portfolioValue,
        disbursedValue,
        fldgExposure,
        fldgCap: FLDG_CAP,
        capLimit,
        utilizationPct: capLimit > 0 ? Math.min(100, Math.round((fldgExposure / capLimit) * 100)) : 0,
        status: fldgExposure <= capLimit ? "compliant" : "BREACH",
      });
    }

    const kfsTotal = activeApps.length;
    const kfsCompliant = activeApps.filter((a) => a.kfsGenerated === true).length;
    const kfsComplianceRate = kfsTotal ? Math.round((kfsCompliant / kfsTotal) * 100) : 100;

    const logTotal = await ComplianceLog.countDocuments();
    const logFailures = await ComplianceLog.countDocuments({ pass: false });

    return res.json({
      capLimit: FLDG_CAP,
      lenders: lenderRows,
      kfsComplianceRate,
      kfsCompliant,
      kfsTotal,
      complianceLogs: { total: logTotal, failures: logFailures },
    });
  })
);

module.exports = router;
