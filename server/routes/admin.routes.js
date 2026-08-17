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

const DLA = require("../models/DLA");
const WebhookLog = require("../models/WebhookLog");
const DLGPortfolio = require("../models/DLGPortfolio");

// PUT /api/lenders/:id  (ADMIN only — configure products without code changes)
router.put(
  "/lenders/:id",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const lender = await LenderProduct.findOne({ id: req.params.id });
    if (!lender) return res.status(404).json({ error: "Lender product not found" });

    const b = req.body || {};
    if (b.minAmount !== undefined) lender.minAmount = Number(b.minAmount);
    if (b.maxAmount !== undefined) lender.maxAmount = Number(b.maxAmount);
    if (b.interestRate !== undefined) lender.interestRate = Number(b.interestRate);
    if (b.APR !== undefined) lender.APR = Number(b.APR);
    if (b.minCibilScore !== undefined) lender.minCibilScore = Number(b.minCibilScore);
    if (b.maxDti !== undefined) lender.maxDti = Number(b.maxDti);
    if (b.minIncome !== undefined) lender.minIncome = Number(b.minIncome);
    if (b.processingFee !== undefined) lender.processingFee = Number(b.processingFee);
    if (b.tenureMonths) lender.tenureMonths = b.tenureMonths.map(Number);
    if (b.supportedPurposes) lender.supportedPurposes = b.supportedPurposes;
    if (b.employmentTypes) lender.employmentTypes = b.employmentTypes;
    if (b.active !== undefined) lender.active = Boolean(b.active);

    await lender.save();
    return res.json(lender);
  })
);

// GET /api/admin/dla-partners  (ADMIN only)
router.get(
  "/admin/dla-partners",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const dlas = await DLA.find().sort({ createdAt: -1 });
    return res.json(dlas);
  })
);

// POST /api/admin/dla-partners  (ADMIN only)
router.post(
  "/admin/dla-partners",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { id, name, apiKey, apiSecret, webhookUrl } = req.body || {};
    if (!id || !name || !apiKey) {
      return res.status(400).json({ error: "id, name, and apiKey are required" });
    }

    const dla = await DLA.create({
      id,
      name,
      apiKey,
      apiSecret: apiSecret || "sec_" + Math.random().toString(36).slice(2),
      webhookUrl: webhookUrl || "",
      status: "ACTIVE",
    });

    return res.status(201).json(dla);
  })
);

// POST /api/admin/dla-partners/:id/regenerate-key  (ADMIN only)
router.post(
  "/admin/dla-partners/:id/regenerate-key",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const dla = await DLA.findOne({ id: req.params.id });
    if (!dla) return res.status(404).json({ error: "DLA partner not found" });

    dla.apiKey = "dla_key_" + Math.random().toString(36).slice(2, 12);
    dla.apiSecret = "sec_" + Math.random().toString(36).slice(2, 16);
    await dla.save();

    return res.json({ id: dla.id, name: dla.name, newApiKey: dla.apiKey, status: dla.status });
  })
);

// POST /api/admin/dla-partners/:id/test-webhook  (ADMIN only)
router.post(
  "/admin/dla-partners/:id/test-webhook",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const dla = await DLA.findOne({ id: req.params.id });
    if (!dla) return res.status(404).json({ error: "DLA partner not found" });

    const { dispatchWebhook } = require("../services/webhookService");
    const testLog = await dispatchWebhook({
      dlaId: dla.id,
      eventType: "application.created",
      resourceId: "APP-SANDBOX-TEST",
      payload: { test: true, message: "Sandbox Webhook Test Dispatch" },
    });

    return res.json({ success: true, webhookLog: testLog });
  })
);

// GET /api/admin/webhooks  (ADMIN only with pagination)
router.get(
  "/admin/webhooks",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await WebhookLog.countDocuments();
    const logs = await WebhookLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit);

    return res.json({ logs, total, page, limit });
  })
);

// GET /api/admin/compliance-logs  (ADMIN only with pagination)
router.get(
  "/admin/compliance-logs",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await ComplianceLog.countDocuments();
    const logs = await ComplianceLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit);

    return res.json({ logs, total, page, limit });
  })
);

module.exports = router;
