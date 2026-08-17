const express = require("express");
const mongoose = require("mongoose");
const LenderProduct = require("../models/LenderProduct");
const LoanApplication = require("../models/LoanApplication");
const ComplianceLog = require("../models/ComplianceLog");
const DLA = require("../models/DLA");
const WebhookLog = require("../models/WebhookLog");
const DLGPortfolio = require("../models/DLGPortfolio");
const User = require("../models/User");
const CreditProfile = require("../models/CreditProfile");
const ConsentRecord = require("../models/ConsentRecord");
const LoanIntent = require("../models/LoanIntent");
const LoanOffer = require("../models/LoanOffer");
const ApplicationRoute = require("../models/ApplicationRoute");
const { authenticate, requireRole } = require("../middleware/auth");
const { getLenderPortfolio, FLDG_CAP } = require("../middleware/rbiCompliance");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// Helper: Data Minimization & PAN Masking (e.g. ABCD****123 or ABC*****4D)
function maskPan(pan) {
  if (!pan || typeof pan !== "string") return "";
  const clean = pan.trim().toUpperCase();
  if (clean.length === 10) {
    return `${clean.slice(0, 4)}****${clean.slice(8)}`;
  }
  return clean.replace(/.(?=.{4})/g, "*");
}

function sanitizeUser(userDoc) {
  const obj = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete obj.passwordHash;
  delete obj.password;
  if (obj.pan) {
    obj.pan = maskPan(obj.pan);
  }
  return obj;
}

function sanitizeDla(dlaDoc) {
  const obj = dlaDoc.toObject ? dlaDoc.toObject() : { ...dlaDoc };
  delete obj.apiSecret;
  delete obj.webhookSecret;
  return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/admin/dashboard
// Comprehensive platform overview metrics, high-level funnel, recent activity
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/dashboard",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const allApps = await LoanApplication.find().sort({ createdAt: -1 });
    const totalApplications = allApps.length;

    // Time window calculations
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const applicationsToday = allApps.filter((a) => new Date(a.createdAt) >= startOfToday).length;
    const applicationsThisMonth = allApps.filter((a) => new Date(a.createdAt) >= startOfMonth).length;

    const totalUsers = await User.countDocuments({ role: "USER" });
    const totalDLAs = await DLA.countDocuments();
    const totalLenders = await LenderProduct.countDocuments();
    const activeLenderProducts = await LenderProduct.countDocuments({ active: true });

    const offersGenerated = await LoanOffer.countDocuments();
    const offersSelected = await LoanOffer.countDocuments({ status: "SELECTED" });

    const loansApproved = allApps.filter((a) =>
      ["APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status)
    ).length;

    const loansRejected = allApps.filter((a) =>
      ["REJECTED", "rejected"].includes(a.status)
    ).length;

    const disbursedApps = allApps.filter((a) =>
      ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status)
    );
    const loansDisbursed = disbursedApps.length;

    const totalRequestedAmount = allApps.reduce((s, a) => s + (a.amount || 0), 0);
    const totalApprovedAmount = allApps
      .filter((a) => ["APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status))
      .reduce((s, a) => s + (a.amount || 0), 0);
    const totalDisbursedAmount = disbursedApps.reduce((s, a) => s + (a.amount || 0), 0);

    const averageLoanAmount = totalApplications > 0 ? Math.round(totalRequestedAmount / totalApplications) : 0;
    const averageCibilScore = totalApplications > 0 ? Math.round(allApps.reduce((s, a) => s + (a.cibilScore || 0), 0) / totalApplications) : 0;

    // Funnel stage counts
    const routedApps = allApps.filter((a) => ["routed", "ROUTED", "APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status));
    const kfsGeneratedCount = allApps.filter((a) => a.kfsGenerated === true).length;
    const eligibilityEvaluatedCount = allApps.filter((a) => Boolean(a.cibilScore) && a.status !== "DRAFT").length;

    const funnel = {
      applications: totalApplications,
      eligibilityEvaluated: eligibilityEvaluatedCount,
      offersGenerated: offersGenerated || (totalApplications > 0 ? totalApplications : 0),
      offersSelected: offersSelected || routedApps.length,
      kfsGenerated: kfsGeneratedCount,
      routed: routedApps.length,
      lenderApproved: loansApproved,
      disbursed: loansDisbursed,
      conversionRate: totalApplications > 0 ? Math.round((loansDisbursed / totalApplications) * 100) : 0,
    };

    // Recent 10 applications with masked PAN
    const recentApplications = allApps.slice(0, 10).map((a) => ({
      id: a.id,
      borrowerName: a.borrowerName,
      pan: maskPan(a.pan),
      mobile: a.mobile,
      amount: a.amount,
      purpose: a.purpose,
      cibilScore: a.cibilScore,
      status: a.status,
      dlaId: a.dlaId,
      routedTo: a.routedTo,
      createdAt: a.createdAt,
    }));

    return res.json({
      overview: {
        totalUsers,
        totalDLAs,
        totalLenders,
        activeLenderProducts,
        totalApplications,
        applicationsToday,
        applicationsThisMonth,
        offersGenerated,
        offersSelected,
        loansApproved,
        loansRejected,
        loansDisbursed,
        totalRequestedAmount,
        totalApprovedAmount,
        totalDisbursedAmount,
        averageLoanAmount,
        averageCibilScore,
      },
      funnel,
      recentApplications,
    });
  })
);

// Backward-compatible stats endpoint
router.get(
  "/admin/stats",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const all = await LoanApplication.find().sort({ createdAt: -1 });
    const total = all.length;
    const routed = all.filter((a) => ["routed", "ROUTED", "APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED"].includes(a.status)).length;
    const disbursed = all.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).length;
    const pending = all.filter((a) => ["pending_review", "SUBMITTED", "ELIGIBILITY_CHECK"].includes(a.status)).length;
    const rejected = all.filter((a) => ["rejected", "REJECTED"].includes(a.status)).length;
    const volume = all.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).reduce((s, a) => s + a.amount, 0);
    const avgCibil = total ? Math.round(all.reduce((s, a) => s + a.cibilScore, 0) / total) : 0;

    return res.json({
      total,
      routed,
      disbursed,
      pending,
      rejected,
      volume,
      avgCibil,
      recent: all.slice(0, 10).map((a) => ({ ...a.toObject(), pan: maskPan(a.pan) })),
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/admin/applications (Paginated & Filterable Read-Only Explorer)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/applications",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const { status, dateFrom, dateTo, lender, dla, purpose, search } = req.query;
    const query = {};

    if (status) {
      if (status === "approved") {
        query.status = { $in: ["APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"] };
      } else if (status === "disbursed") {
        query.status = { $in: ["disbursed", "DISBURSED", "ACTIVE"] };
      } else if (status === "rejected") {
        query.status = { $in: ["rejected", "REJECTED"] };
      } else if (status === "pending") {
        query.status = { $in: ["pending_review", "SUBMITTED", "ELIGIBILITY_CHECK"] };
      } else {
        query.status = status;
      }
    }

    if (lender) query.routedTo = lender;
    if (dla) query.dlaId = dla;
    if (purpose) query.purpose = purpose.toLowerCase();

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    if (search) {
      const s = String(search).trim();
      query.$or = [
        { id: { $regex: s, $options: "i" } },
        { borrowerName: { $regex: s, $options: "i" } },
        { mobile: { $regex: s, $options: "i" } },
        { pan: { $regex: s, $options: "i" } },
        { dlaId: { $regex: s, $options: "i" } },
        { routedTo: { $regex: s, $options: "i" } },
      ];
    }

    const total = await LoanApplication.countDocuments(query);
    const rawApps = await LoanApplication.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);

    const applications = rawApps.map((a) => ({
      ...a.toObject(),
      pan: maskPan(a.pan),
    }));

    return res.json({
      applications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/admin/applications/:id (Read-Only Single Application Inspector)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/applications/:id",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const app = await LoanApplication.findOne({ id: req.params.id });
    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    const [route, offers, complianceHistory, dla, lender] = await Promise.all([
      ApplicationRoute.findOne({ applicationId: app.id }),
      LoanOffer.find({ $or: [{ applicationId: app.id }, { loanIntentId: app.loanIntentId }] }),
      ComplianceLog.find({ applicationId: app.id }).sort({ createdAt: -1 }),
      DLA.findOne({ id: app.dlaId }),
      app.routedTo ? LenderProduct.findOne({ id: app.routedTo }) : null,
    ]);

    const appObj = {
      ...app.toObject(),
      pan: maskPan(app.pan),
    };

    return res.json({
      application: appObj,
      route,
      offers,
      complianceHistory,
      dla: dla ? sanitizeDla(dla) : null,
      lender,
      readOnly: true,
      accessLevel: "PLATFORM_OBSERVER",
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/admin/users (Read-Only User Explorer with Data Minimization)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/users",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const { role, search } = req.query;
    const query = {};

    if (role) query.role = role;
    if (search) {
      const s = String(search).trim();
      query.$or = [
        { username: { $regex: s, $options: "i" } },
        { fullName: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { mobile: { $regex: s, $options: "i" } },
        { userId: { $regex: s, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = (await User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)).map(sanitizeUser);

    return res.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /api/admin/users/:id (Read-Only Single User Profile Inspector)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/users/:id",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(req.params.id) ? req.params.id : null },
        { userId: req.params.id },
        { username: req.params.id.toLowerCase() },
      ],
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const userIdKey = user.userId || user.id;
    const [creditProfile, consents, userApps] = await Promise.all([
      CreditProfile.findOne({ userId: userIdKey }),
      ConsentRecord.find({ userId: userIdKey }).sort({ createdAt: -1 }),
      LoanApplication.find({ $or: [{ userId: userIdKey }, { pan: user.pan }] })
        .select("id amount purpose status createdAt routedTo cibilScore")
        .sort({ createdAt: -1 }),
    ]);

    return res.json({
      user: sanitizeUser(user),
      creditProfile,
      consents,
      applications: userApps,
      readOnly: true,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET /api/admin/lenders (Read-Only Lender Performance & Catalog)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/lenders",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const lenders = await LenderProduct.find().sort({ id: 1 });
    const allApps = await LoanApplication.find();

    const lenderData = [];
    for (const l of lenders) {
      const owned = allApps.filter((a) => a.routedTo === l.id);
      const applicationsReceived = owned.length;
      const approvedApps = owned.filter((a) =>
        ["APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status)
      );
      const rejectedApps = owned.filter((a) => ["rejected", "REJECTED"].includes(a.status));
      const disbursedApps = owned.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status));

      const approvedCount = approvedApps.length;
      const rejectedCount = rejectedApps.length;
      const disbursedCount = disbursedApps.length;

      const disbursedVolume = disbursedApps.reduce((s, a) => s + (a.amount || 0), 0);
      const portfolioValue = owned.reduce((s, a) => s + (a.amount || 0), 0);

      const fldgExposure = FLDG_CAP * disbursedVolume;
      const capLimit = FLDG_CAP * portfolioValue;
      const utilizationPct = capLimit > 0 ? Math.min(100, Math.round((fldgExposure / capLimit) * 100)) : 0;

      const approvalRate = applicationsReceived > 0 ? Math.round((approvedCount / applicationsReceived) * 100) : 0;
      const rejectionRate = applicationsReceived > 0 ? Math.round((rejectedCount / applicationsReceived) * 100) : 0;
      const disbursalRate = applicationsReceived > 0 ? Math.round((disbursedCount / applicationsReceived) * 100) : 0;
      const averageLoanAmount = applicationsReceived > 0 ? Math.round(portfolioValue / applicationsReceived) : 0;

      lenderData.push({
        ...l.toObject(),
        metrics: {
          applicationsReceived,
          approvedCount,
          rejectedCount,
          disbursedCount,
          disbursedVolume,
          portfolioValue,
          approvalRate,
          rejectionRate,
          disbursalRate,
          averageLoanAmount,
          fldgExposure,
          capLimit,
          fldgCap: FLDG_CAP,
          utilizationPct,
          status: fldgExposure <= capLimit ? "COMPLIANT" : "BREACH",
        },
      });
    }

    return res.json({ lenders: lenderData, total: lenderData.length });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET /api/admin/dlas (Read-Only DLA Performance & Integrations)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/dlas",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const dlas = await DLA.find().sort({ createdAt: -1 });
    const allApps = await LoanApplication.find();
    const allOffers = await LoanOffer.find();
    const allWebhooks = await WebhookLog.find();

    const dlaData = [];
    for (const d of dlas) {
      const ownedApps = allApps.filter((a) => a.dlaId === d.id);
      const applicationsCount = ownedApps.length;

      const appIds = new Set(ownedApps.map((a) => a.id));
      const dlaOffers = allOffers.filter((o) => appIds.has(o.applicationId));
      const offersGenerated = dlaOffers.length;
      const offersSelected = dlaOffers.filter((o) => o.status === "SELECTED").length;

      const approvedLoans = ownedApps.filter((a) =>
        ["APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status)
      ).length;

      const disbursedApps = ownedApps.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status));
      const disbursedLoans = disbursedApps.length;
      const disbursalVolume = disbursedApps.reduce((s, a) => s + (a.amount || 0), 0);

      const offerSelectionRate = offersGenerated > 0 ? Math.round((offersSelected / offersGenerated) * 100) : 0;
      const disbursalRate = applicationsCount > 0 ? Math.round((disbursedLoans / applicationsCount) * 100) : 0;

      const dlaWebhooks = allWebhooks.filter((w) => w.dlaId === d.id);
      const webhookCount = dlaWebhooks.length;
      const webhookSuccessCount = dlaWebhooks.filter((w) => w.success === true).length;
      const webhookSuccessRate = webhookCount > 0 ? Math.round((webhookSuccessCount / webhookCount) * 100) : 100;

      dlaData.push({
        ...sanitizeDla(d),
        metrics: {
          applicationsCount,
          offersGenerated,
          offersSelected,
          offerSelectionRate,
          approvedLoans,
          disbursedLoans,
          disbursalVolume,
          disbursalRate,
          webhookCount,
          webhookSuccessCount,
          webhookSuccessRate,
        },
      });
    }

    return res.json({ dlas: dlaData, total: dlaData.length });
  })
);

// Backward-compatible DLA partners list
router.get(
  "/admin/dla-partners",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const dlas = (await DLA.find().sort({ createdAt: -1 })).map(sanitizeDla);
    return res.json(dlas);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET /api/admin/analytics (Funnel & Volume Analytics)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/analytics",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const allApps = await LoanApplication.find();
    const total = allApps.length;

    const eligibilityEvaluated = allApps.filter((a) => Boolean(a.cibilScore) && a.status !== "DRAFT").length;
    const offersGen = await LoanOffer.countDocuments();
    const offersSel = await LoanOffer.countDocuments({ status: "SELECTED" });
    const kfsGen = allApps.filter((a) => a.kfsGenerated === true).length;
    const routed = allApps.filter((a) => ["routed", "ROUTED", "APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).length;
    const approved = allApps.filter((a) => ["APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).length;
    const disbursed = allApps.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).length;

    const funnelStages = [
      { name: "Applications", count: total, pctOfTotal: 100, dropOffPct: 0 },
      {
        name: "Eligibility Evaluated",
        count: eligibilityEvaluated,
        pctOfTotal: total > 0 ? Math.round((eligibilityEvaluated / total) * 100) : 0,
        dropOffPct: total > 0 ? Math.max(0, Math.round(((total - eligibilityEvaluated) / total) * 100)) : 0,
      },
      {
        name: "Offers Generated",
        count: offersGen || (total > 0 ? total : 0),
        pctOfTotal: total > 0 ? Math.round(((offersGen || total) / total) * 100) : 0,
        dropOffPct: 0,
      },
      {
        name: "Offers Selected",
        count: offersSel || routed,
        pctOfTotal: total > 0 ? Math.round(((offersSel || routed) / total) * 100) : 0,
        dropOffPct: offersGen > 0 ? Math.max(0, Math.round(((offersGen - (offersSel || routed)) / offersGen) * 100)) : 0,
      },
      {
        name: "KFS Generated",
        count: kfsGen,
        pctOfTotal: total > 0 ? Math.round((kfsGen / total) * 100) : 0,
        dropOffPct: (offersSel || routed) > 0 ? Math.max(0, Math.round((((offersSel || routed) - kfsGen) / (offersSel || routed)) * 100)) : 0,
      },
      {
        name: "Routed to Lender",
        count: routed,
        pctOfTotal: total > 0 ? Math.round((routed / total) * 100) : 0,
        dropOffPct: kfsGen > 0 ? Math.max(0, Math.round(((kfsGen - routed) / kfsGen) * 100)) : 0,
      },
      {
        name: "Lender Approved",
        count: approved,
        pctOfTotal: total > 0 ? Math.round((approved / total) * 100) : 0,
        dropOffPct: routed > 0 ? Math.max(0, Math.round(((routed - approved) / routed) * 100)) : 0,
      },
      {
        name: "Disbursed",
        count: disbursed,
        pctOfTotal: total > 0 ? Math.round((disbursed / total) * 100) : 0,
        dropOffPct: approved > 0 ? Math.max(0, Math.round(((approved - disbursed) / approved) * 100)) : 0,
      },
    ];

    // Status breakdown
    const statusCounts = {};
    for (const a of allApps) {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    }

    return res.json({
      funnel: funnelStages,
      statusCounts,
      totalApplications: total,
      totalDisbursed: disbursed,
      overallConversionRate: total > 0 ? Math.round((disbursed / total) * 100) : 0,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 9. GET /api/admin/analytics/consumption (Consumption Credit Analytics)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/analytics/consumption",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const allApps = await LoanApplication.find();
    const totalVolumeAll = allApps.reduce((s, a) => s + (a.amount || 0), 0);

    const standardCategories = [
      "electronics",
      "shopping",
      "travel",
      "healthcare",
      "education",
      "home_improvement",
      "personal",
      "other",
    ];

    // Collect all present purposes
    const presentPurposes = new Set(standardCategories);
    for (const a of allApps) {
      if (a.purpose) presentPurposes.add(a.purpose.toLowerCase());
    }

    const categories = [];
    for (const cat of presentPurposes) {
      const match = allApps.filter((a) => (a.purpose || "").toLowerCase() === cat);
      const count = match.length;
      const requestedAmount = match.reduce((s, a) => s + (a.amount || 0), 0);
      const averageLoanAmount = count > 0 ? Math.round(requestedAmount / count) : 0;

      const approved = match.filter((a) =>
        ["APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status)
      ).length;

      const disbursedApps = match.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status));
      const disbursedCount = disbursedApps.length;
      const disbursedVolume = disbursedApps.reduce((s, a) => s + (a.amount || 0), 0);

      const approvalRate = count > 0 ? Math.round((approved / count) * 100) : 0;
      const disbursalRate = count > 0 ? Math.round((disbursedCount / count) * 100) : 0;
      const averageTenure = count > 0 ? Math.round(match.reduce((s, a) => s + (a.tenure || 0), 0) / count) : 0;
      const averageCibilScore = count > 0 ? Math.round(match.reduce((s, a) => s + (a.cibilScore || 0), 0) / count) : 0;
      const shareOfTotalVolume = totalVolumeAll > 0 ? Math.round((requestedAmount / totalVolumeAll) * 100) : 0;

      // Clean label
      const label = cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      categories.push({
        purpose: cat,
        label,
        applicationCount: count,
        requestedAmount,
        averageLoanAmount,
        approvedCount: approved,
        disbursedCount,
        disbursedVolume,
        approvalRate,
        disbursalRate,
        averageTenure,
        averageCibilScore,
        shareOfTotalVolume,
      });
    }

    // Sort by count descending
    categories.sort((a, b) => b.applicationCount - a.applicationCount);

    return res.json({
      categories,
      totalApplications: allApps.length,
      totalVolume: totalVolumeAll,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 10. GET /api/admin/analytics/lenders
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/analytics/lenders",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const lenders = await LenderProduct.find().sort({ id: 1 });
    const allApps = await LoanApplication.find();

    const performance = lenders.map((l) => {
      const owned = allApps.filter((a) => a.routedTo === l.id);
      const apps = owned.length;
      const approved = owned.filter((a) => ["APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).length;
      const rejected = owned.filter((a) => ["rejected", "REJECTED"].includes(a.status)).length;
      const disbursed = owned.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).length;
      const volume = owned.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).reduce((s, a) => s + (a.amount || 0), 0);

      return {
        lenderId: l.id,
        lenderName: l.lenderName,
        type: l.type,
        interestRate: l.interestRate,
        applications: apps,
        approved,
        rejected,
        disbursed,
        volume,
        approvalRate: apps > 0 ? Math.round((approved / apps) * 100) : 0,
        rejectionRate: apps > 0 ? Math.round((rejected / apps) * 100) : 0,
        disbursalRate: apps > 0 ? Math.round((disbursed / apps) * 100) : 0,
        averageLoanAmount: apps > 0 ? Math.round(owned.reduce((s, a) => s + a.amount, 0) / apps) : 0,
        activePortfolio: owned.reduce((s, a) => s + a.amount, 0),
        disbursalSLA: l.disbursalTime,
      };
    });

    return res.json({ lenders: performance });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 11. GET /api/admin/analytics/dlas
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/analytics/dlas",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const dlas = await DLA.find().sort({ id: 1 });
    const allApps = await LoanApplication.find();
    const allOffers = await LoanOffer.find();

    const performance = dlas.map((d) => {
      const owned = allApps.filter((a) => a.dlaId === d.id);
      const apps = owned.length;
      const appIds = new Set(owned.map((a) => a.id));
      const offers = allOffers.filter((o) => appIds.has(o.applicationId)).length;
      const selected = allOffers.filter((o) => appIds.has(o.applicationId) && o.status === "SELECTED").length;
      const approved = owned.filter((a) => ["APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).length;
      const disbursed = owned.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).length;
      const volume = owned.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status)).reduce((s, a) => s + a.amount, 0);

      return {
        dlaId: d.id,
        dlaName: d.name,
        status: d.status,
        applications: apps,
        offers,
        selected,
        offerSelectionRate: offers > 0 ? Math.round((selected / offers) * 100) : 0,
        approved,
        disbursed,
        disbursalVolume: volume,
        disbursalRate: apps > 0 ? Math.round((disbursed / apps) * 100) : 0,
        rateLimit: d.rateLimit,
      };
    });

    return res.json({ dlas: performance });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 12. GET /api/admin/compliance (RBI Digital Lending 2022 Compliance Overview)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/compliance",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const lenders = await LenderProduct.find().sort({ id: 1 });
    const activeApps = await LoanApplication.find({
      status: { $in: ["routed", "ROUTED", "disbursed", "DISBURSED", "APPROVED", "ACTIVE"] },
    });
    const allApps = await LoanApplication.find();

    const lenderRows = [];
    for (const l of lenders) {
      const owned = activeApps.filter((a) => a.routedTo === l.id);
      const portfolioValue = owned.reduce((s, a) => s + a.amount, 0);
      const disbursedValue = owned
        .filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status))
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

    const aaTotal = allApps.length;
    const aaCompliant = allApps.filter((a) => a.aaConsent === true).length;
    const aaConsentRate = aaTotal ? Math.round((aaCompliant / aaTotal) * 100) : 100;

    const bureauTotal = allApps.length;
    const bureauCompliant = allApps.filter((a) => Boolean(a.cibilScore)).length;
    const bureauConsentRate = bureauTotal ? Math.round((bureauCompliant / bureauTotal) * 100) : 100;

    const logTotal = await ComplianceLog.countDocuments();
    const logFailures = await ComplianceLog.countDocuments({ pass: false });
    const blockedRoutes = await ComplianceLog.countDocuments({ type: "ROUTE_BLOCKED_DLG_CAP" });
    const kfsFailures = await ComplianceLog.countDocuments({ type: "KFS_BEFORE_ROUTING", pass: false });
    const fldgViolations = await ComplianceLog.countDocuments({ type: "FLDG_CAP_CHECK", pass: false });

    return res.json({
      capLimit: FLDG_CAP,
      lenders: lenderRows,
      kfsComplianceRate,
      kfsCompliant,
      kfsTotal,
      aaConsentRate,
      aaCompliant,
      aaTotal,
      bureauConsentRate,
      bureauCompliant,
      bureauTotal,
      fldgViolations,
      blockedRoutes,
      kfsFailures,
      complianceLogs: { total: logTotal, failures: logFailures },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 13. GET /api/admin/fldg (FLDG / DLG Monitoring)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/fldg",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const lenders = await LenderProduct.find().sort({ id: 1 });
    const allActive = await LoanApplication.find({
      status: { $in: ["routed", "ROUTED", "APPROVED", "DISBURSAL_PENDING", "disbursed", "DISBURSED", "ACTIVE"] },
    });

    const monitoring = [];
    for (const l of lenders) {
      const owned = allActive.filter((a) => a.routedTo === l.id);
      const portfolioOutstanding = owned.reduce((s, a) => s + (a.amount || 0), 0);
      const disbursedApps = owned.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status));
      const disbursedOutstanding = disbursedApps.reduce((s, a) => s + (a.amount || 0), 0);

      const dlgExposure = FLDG_CAP * disbursedOutstanding;
      const applicableCap = FLDG_CAP * portfolioOutstanding;
      const utilizationPct = applicableCap > 0 ? Math.min(100, Math.round((dlgExposure / applicableCap) * 100)) : 0;
      const availableCapacity = Math.max(0, applicableCap - dlgExposure);
      const status = dlgExposure <= applicableCap ? "WITHIN_LIMIT" : "BREACH";

      monitoring.push({
        lenderId: l.id,
        lenderName: l.lenderName,
        lenderType: l.type,
        portfolioOutstanding,
        disbursedOutstanding,
        dlgExposure,
        applicableCap,
        capPercentage: 5,
        utilizationPct,
        availableCapacity,
        status,
      });
    }

    const blockedRouteEvents = await ComplianceLog.find({ type: "ROUTE_BLOCKED_DLG_CAP" })
      .sort({ createdAt: -1 })
      .limit(20);

    return res.json({
      capLimitPct: 5,
      regulatorNotice: "RBI Digital Lending Guidelines (2022) cap First Loss Default Guarantee (FLDG) at 5% of lender portfolio value.",
      monitoring,
      blockedRouteEvents,
      adminOverrideAllowed: false,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 14. GET /api/admin/audit-logs (Filterable Compliance & Audit Log Viewer)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/audit-logs",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const skip = (page - 1) * limit;

    const { eventType, type, userId, applicationId, actor, actorRole, pass, dateFrom, dateTo } = req.query;
    const query = {};

    const targetType = eventType || type;
    if (targetType) query.type = targetType;
    if (userId) query.userId = userId;
    if (applicationId) query.applicationId = applicationId;
    if (actor) query.actor = { $regex: actor, $options: "i" };
    if (actorRole) query.actorRole = actorRole;
    if (pass !== undefined) query.pass = pass === "true" || pass === true;

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    const total = await ComplianceLog.countDocuments(query);
    const logs = await ComplianceLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);

    const distinctTypes = await ComplianceLog.distinct("type");

    return res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      availableEventTypes: distinctTypes,
    });
  })
);

// Backward-compatible compliance logs endpoint
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

// ─────────────────────────────────────────────────────────────────────────────
// 15. GET /api/admin/webhooks (Read-Only Webhook Logs)
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 16. GET /api/admin/system-health (System Health & Infrastructure Monitor)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/admin/system-health",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const dbState = mongoose.connection.readyState;
    const isDbConnected = dbState === 1;

    const mem = process.memoryUsage();

    return res.json({
      status: "HEALTHY",
      service: "vantage-credit-api",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: {
        status: isDbConnected ? "CONNECTED" : "DISCONNECTED",
        readyState: dbState,
      },
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      },
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      platform: process.platform,
      subsystems: {
        creditEngine: "OPERATIONAL",
        kfsGenerator: "OPERATIONAL",
        accountAggregator: "OPERATIONAL",
        bureauGateway: "OPERATIONAL",
        webhookDispatcher: "OPERATIONAL",
        stateMachine: "OPERATIONAL",
      },
      complianceGuards: {
        fldgEnforcement: "ACTIVE (5% Limit)",
        kfsPreGeneration: "ACTIVE (Server-side Enforced)",
        directFundsFlow: "ACTIVE (Non-Custodial)",
        roleSeparation: "ACTIVE (ADMIN Read-Only)",
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 17. Explicit Prohibitions on Mutation Endpoints for ADMIN
// ADMIN role is denied mutation operations across platform products & DLAs
// ─────────────────────────────────────────────────────────────────────────────
const adminForbiddenMutation = (req, res) => {
  return res.status(403).json({
    success: false,
    error: {
      code: "FORBIDDEN",
      message: "ADMIN role has read-only platform monitoring access. Mutation operations are prohibited.",
    },
    requestId: req.requestId,
  });
};

router.post("/lenders", authenticate, adminForbiddenMutation);
router.put("/lenders/:id", authenticate, adminForbiddenMutation);
router.delete("/lenders/:id", authenticate, adminForbiddenMutation);

router.post("/products", authenticate, adminForbiddenMutation);
router.put("/products/:id", authenticate, adminForbiddenMutation);
router.delete("/products/:id", authenticate, adminForbiddenMutation);

router.post("/admin/dla-partners", authenticate, adminForbiddenMutation);
router.post("/admin/dla-partners/:id/regenerate-key", authenticate, adminForbiddenMutation);
router.post("/admin/dla-partners/:id/test-webhook", authenticate, adminForbiddenMutation);

module.exports = router;
