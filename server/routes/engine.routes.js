const express = require("express");
const LoanApplication = require("../models/LoanApplication");
const LenderProduct = require("../models/LenderProduct");
const ApplicationRoute = require("../models/ApplicationRoute");
const { authenticate, requireRole, canAccessApplication } = require("../middleware/auth");
const { kfsBeforeRouting, fldgCapCheck } = require("../middleware/rbiCompliance");
const { runCreditEngine } = require("../services/creditEngine");
const { generateKFS } = require("../services/kfsGenerator");
const ocenService = require("../services/ocenService");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// POST /api/applications/:id/run-engine  (DLA / ADMIN)
// Runs eligibility matching across ALL lender products. Does not mutate state.
router.post(
  "/applications/:id/run-engine",
  authenticate,
  requireRole("DLA", "ADMIN"),
  canAccessApplication,
  asyncHandler(async (req, res) => {
    const app = req.application.toObject();
    const lenders = (await LenderProduct.find()).map((l) => l.toObject());
    const result = runCreditEngine(app, lenders);
    return res.json(result);
  })
);

// POST /api/applications/:id/route  (DLA / ADMIN)
// Body: { lenderId }
// Gates: KFS_BEFORE_ROUTING (KFS must be generated now, before the route is
// persisted) + FLDG_CAP check. Generates + stores the KFS, creates the
// ApplicationRoute, and moves the application to 'routed'.
router.post(
  "/applications/:id/route",
  authenticate,
  requireRole("DLA", "ADMIN"),
  canAccessApplication,
  kfsBeforeRouting,
  fldgCapCheck,
  asyncHandler(async (req, res) => {
    const { lenderId } = req.body || {};
    if (!lenderId) {
      return res.status(400).json({ error: "lenderId is required" });
    }

    const lender = await LenderProduct.findOne({ id: lenderId });
    if (!lender) {
      return res.status(404).json({ error: "Lender product not found" });
    }

    const appPlain = req.application.toObject();
    const lenders = (await LenderProduct.find()).map((l) => l.toObject());
    const result = runCreditEngine(appPlain, lenders);

    const hit = result.eligible.find((e) => e.lender.id === lenderId);
    if (!hit) {
      const rejectedHit = result.rejected.find((r) => r.lender.id === lenderId);
      return res.status(400).json({
        error: "Lender is not eligible for this application",
        reasons: rejectedHit ? rejectedHit.reasons : [],
      });
    }

    // KFS is generated BEFORE the route is persisted (RBI DL 2022).
    const kfsData = generateKFS(appPlain, lender.toObject());

    const route = await ApplicationRoute.findOneAndUpdate(
      { applicationId: req.application.id },
      {
        applicationId: req.application.id,
        lenderId,
        score: hit.score,
        emi: hit.emi,
        totalPayable: kfsData.totalPayable,
        routedAt: new Date(),
        status: "pending",
        kfsData,
        rejectionReasons: [],
      },
      { upsert: true, new: true }
    );

    req.application.status = "routed";
    req.application.routedTo = lenderId;
    req.application.routedAt = new Date();
    req.application.kfsGenerated = true;
    await req.application.save();

    // If the lender is OCEN-enabled, fire the OCEN stub (not persisted here;
    // a real integration would write the OCEN ref into the route document).
    let ocen = null;
    if (lender.ocenEnabled) {
      ocen = await ocenService.routeToLender({ application: appPlain, lender: lender.toObject() });
    }

    return res.json({ application: req.application, route, kfsData, ocen });
  })
);

module.exports = router;
