const express = require("express");
const User = require("../models/User");
const CreditProfile = require("../models/CreditProfile");
const ConsentRecord = require("../models/ConsentRecord");
const LoanIntent = require("../models/LoanIntent");
const LoanOffer = require("../models/LoanOffer");
const LoanApplication = require("../models/LoanApplication");
const LenderProduct = require("../models/LenderProduct");
const ApplicationRoute = require("../models/ApplicationRoute");
const { authenticate, requireRole } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const { nextIntentId, nextOfferId, nextApplicationId, nextConsentId } = require("../utils/idGenerator");
const { matchMarketplaceOffers } = require("../services/creditEngine");
const { generateKFS } = require("../services/kfsGenerator");
const { logCompliance } = require("../middleware/rbiCompliance");
const bureauService = require("../services/bureauService");
const aaService = require("../services/aaService");
const consentService = require("../services/consent.service");

const router = express.Router();

// GET /api/profile
router.get(
  "/profile",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(user);
  })
);

// PUT /api/profile
router.put(
  "/profile",
  authenticate,
  requireRole("USER"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: "User not found" });

    const b = req.body || {};
    if (b.fullName !== undefined) user.fullName = b.fullName;
    if (b.email !== undefined) user.email = b.email;
    if (b.mobile !== undefined) user.mobile = b.mobile;
    if (b.pan !== undefined) user.pan = b.pan.toUpperCase();
    if (b.dateOfBirth !== undefined) user.dateOfBirth = b.dateOfBirth;
    if (b.address !== undefined) user.address = b.address;
    if (b.employmentType !== undefined) user.employmentType = b.employmentType;
    if (b.employerName !== undefined) user.employerName = b.employerName;
    if (b.monthlyIncome !== undefined) user.monthlyIncome = Number(b.monthlyIncome);
    if (b.monthlyObligations !== undefined) user.monthlyObligations = Number(b.monthlyObligations);

    let fields = [user.fullName, user.email, user.mobile, user.pan, user.dateOfBirth, user.address, user.employmentType, user.monthlyIncome];
    let filled = fields.filter((f) => Boolean(f)).length;
    user.profileCompletion = Math.min(100, Math.round((filled / fields.length) * 100));

    await user.save();

    await logCompliance({
      type: "PROFILE_UPDATED",
      userId: user.userId || user.id,
      actor: user.username,
      actorRole: "USER",
      pass: true,
      details: { profileCompletion: user.profileCompletion },
    });

    return res.json(user);
  })
);

// GET /api/credit-profile
router.get(
  "/credit-profile",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    let profile = await CreditProfile.findOne({ userId: userIdKey });

    if (!profile) {
      profile = await CreditProfile.create({
        userId: userIdKey,
        cibilScore: 750,
        monthlyIncome: user?.monthlyIncome || 60000,
        monthlyObligations: user?.monthlyObligations || 12000,
        dti: (user?.monthlyObligations || 12000) / (user?.monthlyIncome || 60000),
        bureauStatus: "PULLED",
        bureauLastPulledAt: new Date(),
        aaStatus: "CONNECTED",
        profileCompleteness: user?.profileCompletion || 65,
      });
    }

    return res.json(profile);
  })
);

// POST /api/credit-profile/bureau-pull
router.post(
  "/credit-profile/bureau-pull",
  authenticate,
  requireRole("USER"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;

    const pullResult = bureauService.pullCibil(user?.pan || "ABCPS1234D");
    let profile = await CreditProfile.findOne({ userId: userIdKey });
    if (!profile) {
      profile = new CreditProfile({ userId: userIdKey });
    }

    profile.cibilScore = pullResult.cibilScore;
    profile.bureauStatus = "PULLED";
    profile.bureauLastPulledAt = new Date();
    await profile.save();

    await consentService.grantConsent({
      userId: userIdKey,
      consentType: "BUREAU_DATA",
      purpose: "Credit bureau score pull and loan eligibility evaluation",
      dataCategory: "CREDIT_HISTORY",
      provider: "CIBIL / TransUnion",
      durationDays: 90,
      source: "CONSUMER_PROFILE_BUREAU_PULL",
      actor: user.username,
      actorRole: "USER",
    });

    await logCompliance({
      type: "BUREAU_PULL",
      userId: userIdKey,
      actor: user.username,
      actorRole: "USER",
      pass: true,
      details: { cibilScore: pullResult.cibilScore },
    });

    return res.json({ profile, bureauData: pullResult, bureauResult: pullResult });
  })
);

// GET /api/consents/definitions (Catalogue of purpose-specific consent templates)
router.get(
  "/consents/definitions",
  authenticate,
  (req, res) => {
    return res.json(consentService.getConsentDefinitions());
  }
);

// GET /api/consents/summary (Compact aggregated consent status for consumer dashboard)
router.get(
  "/consents/summary",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = req.query?.userId || user?.userId || req.user.userId || (req.user.role === "USER" ? req.user.sub : "USR-001");
    const summary = await consentService.getConsentSummary(userIdKey);
    return res.json(summary);
  })
);

// GET /api/consents (Role-scoped list of consent records)
router.get(
  "/consents",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = req.query?.userId || user?.userId || req.user.userId || (req.user.role === "USER" ? req.user.sub : "USR-001");
    
    let query = {};
    if (req.user.role === "ADMIN" && !req.query.userId) {
      query = {}; // Admin sees all consent audit records
    } else {
      query = { $or: [{ userId: userIdKey }, { userId: req.user.sub }] };
    }

    const consents = await ConsentRecord.find(query).sort({ createdAt: -1 });
    return res.json(consents);
  })
);


// POST /api/consents (Grant single purpose-specific consent)
router.post(
  "/consents",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = req.body?.userId || user?.userId || (req.user.role === "USER" ? req.user.sub : "USR-001");
    const { consentType, purpose, dataCategory, provider, durationDays, source, metadata } = req.body || {};

    const consent = await consentService.grantConsent({
      userId: userIdKey,
      consentType: consentType || "AA_FINANCIAL_DATA",
      purpose,
      dataCategory,
      provider,
      durationDays,
      source: source || "CONSENT_CENTER",
      metadata,
      actor: user?.username || req.user.username || "SYSTEM",
      actorRole: req.user.role || "USER",
    });

    return res.status(201).json({ success: true, consent, message: "Completed" });
  })
);

// POST /api/consents/batch (Grant or reject multiple explicit purpose consents)
router.post(
  "/consents/batch",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = req.body?.userId || user?.userId || (req.user.role === "USER" ? req.user.sub : "USR-001");
    const { consents = [], source = "CONSUMER_CONSENT_CENTER", applicationId } = req.body || {};

    const results = await consentService.grantBatchConsents({
      userId: userIdKey,
      consents,
      source,
      applicationId,
      actor: user?.username || req.user.username || "SYSTEM",
      actorRole: req.user.role || "USER",
    });

    return res.status(201).json({ success: true, count: results.length, consents: results, message: "Completed" });
  })
);

// POST /api/consents/:id/revoke (Revoke an active consent with audit trail)
router.post(
  "/consents/:id/revoke",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = req.user.role === "ADMIN" ? null : (user?.userId || req.user.sub);
    const { reason = "Revoked via Consent Center" } = req.body || {};

    const revoked = await consentService.revokeConsent({
      consentId: req.params.id,
      userId: userIdKey,
      reason,
      actor: user?.username || req.user.username || "SYSTEM",
      actorRole: req.user.role || "USER",
    });

    return res.json({ success: true, consent: revoked, message: "Completed" });
  })
);



// POST /api/loan-intents
router.post(
  "/loan-intents",
  authenticate,
  requireRole("USER"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    const { purpose, requestedAmount, preferredTenure } = req.body || {};

    if (!purpose || !requestedAmount || !preferredTenure) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_PARAMS", message: "purpose, requestedAmount, and preferredTenure are required" },
      });
    }

    const numAmount = Number(requestedAmount);
    const numTenure = Number(preferredTenure);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_AMOUNT", message: "requestedAmount must be a positive number" },
      });
    }

    if (isNaN(numTenure) || numTenure <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_TENURE", message: "preferredTenure must be a positive number" },
      });
    }

    const intentId = await nextIntentId();
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 30);

    const intent = await LoanIntent.create({
      id: intentId,
      userId: userIdKey,
      purpose: String(purpose).trim(),
      requestedAmount: numAmount,
      preferredTenure: numTenure,
      status: "ACTIVE",
      expiresAt: expDate,
    });

    return res.status(201).json({
      success: true,
      id: intent.id,
      intent,
      loanIntent: {
        id: intent.id,
        purpose: intent.purpose,
        amount: intent.requestedAmount,
        requestedAmount: intent.requestedAmount,
        tenure: intent.preferredTenure,
        preferredTenure: intent.preferredTenure,
        status: intent.status,
      },
      message: "Credit intent registered successfully",
    });
  })
);

// GET /api/loan-intents
router.get(
  "/loan-intents",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    const intents = await LoanIntent.find({ userId: userIdKey }).sort({ createdAt: -1 });
    return res.json(intents);
  })
);

// POST /api/loan-intents/:id/find-offers
router.post(
  "/loan-intents/:id/find-offers",
  authenticate,
  requireRole("USER"),
  asyncHandler(async (req, res) => {
    const rawId = req.params.id;
    if (!rawId || rawId === "undefined" || rawId === "null" || !String(rawId).trim()) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_INTENT_ID", message: "A valid loanIntentId parameter is required" },
      });
    }

    const intent = await LoanIntent.findOne({ id: rawId.trim() });
    if (!intent) {
      return res.status(404).json({
        success: false,
        error: { code: "LOAN_INTENT_NOT_FOUND", message: "Loan intent not found" },
      });
    }

    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    let creditProfile = await CreditProfile.findOne({ userId: userIdKey });
    if (!creditProfile) {
      creditProfile = {
        cibilScore: 750,
        monthlyIncome: user?.monthlyIncome || 75000,
        monthlyObligations: user?.monthlyObligations || 15000,
      };
    }

    const lenders = (await LenderProduct.find({ active: true })).map((l) => l.toObject());
    const matchResults = matchMarketplaceOffers(intent, creditProfile, user, lenders);

    await LoanOffer.deleteMany({ loanIntentId: intent.id });

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 14);

    const offerRecords = [];
    for (const item of matchResults.eligibleProducts) {
      const offerId = await nextOfferId();
      const offer = await LoanOffer.create({
        id: offerId,
        loanIntentId: intent.id,
        lenderProductId: item.lender.id,
        lenderId: item.lender.id,
        lenderName: item.lender.lenderName,
        amount: intent.requestedAmount,
        interestRate: item.lender.interestRate,
        APR: item.apr,
        tenure: intent.preferredTenure,
        EMI: item.emi,
        processingFee: item.processingFee,
        totalRepayment: item.totalRepayment,
        disbursalTime: item.lender.disbursalTime,
        eligibilityReasons: item.reasons,
        status: "GENERATED",
        expiresAt: expDate,
      });
      offerRecords.push(offer);
    }

    intent.status = "OFFERS_GENERATED";
    await intent.save();

    await logCompliance({
      type: "OFFER_GENERATED",
      userId: userIdKey,
      actor: user.username,
      actorRole: "USER",
      pass: true,
      details: { intentId: intent.id, offerCount: offerRecords.length },
    });

    return res.json({
      success: true,
      intent,
      offers: offerRecords,
      ineligibleLenders: matchResults.ineligibleProducts,
    });
  })
);

// GET /api/loan-intents/:id/offers
router.get(
  "/loan-intents/:id/offers",
  authenticate,
  asyncHandler(async (req, res) => {
    const rawId = req.params.id;
    if (!rawId || rawId === "undefined" || rawId === "null" || !String(rawId).trim()) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_INTENT_ID", message: "A valid loanIntentId parameter is required" },
      });
    }

    const offers = await LoanOffer.find({ loanIntentId: rawId.trim() }).sort({ interestRate: 1 });
    return res.json(offers);
  })
);

// POST /api/offers/:id/select
router.post(
  "/offers/:id/select",
  authenticate,
  requireRole("USER"),
  asyncHandler(async (req, res) => {
    const rawId = req.params.id;
    if (!rawId || rawId === "undefined" || rawId === "null" || !String(rawId).trim()) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_OFFER_ID", message: "A valid offerId parameter is required" },
      });
    }

    const offer = await LoanOffer.findOne({ id: rawId.trim() });
    if (!offer) {
      return res.status(404).json({
        success: false,
        error: { code: "OFFER_NOT_FOUND", message: "Offer not found" },
      });
    }

    if (offer.status === "SELECTED" && offer.applicationId) {
      return res.status(409).json({
        success: false,
        error: { code: "OFFER_ALREADY_SELECTED", message: "This offer has already been selected and routed to lender" },
      });
    }

    const intent = await LoanIntent.findOne({ id: offer.loanIntentId });
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    const creditProfile = await CreditProfile.findOne({ userId: userIdKey });
    const lender = await LenderProduct.findOne({ id: offer.lenderProductId });

    if (!lender) {
      return res.status(404).json({
        success: false,
        error: { code: "LENDER_UNAVAILABLE", message: "Lender product unavailable" },
      });
    }

    const appId = await nextApplicationId();
    const pan = user?.pan || "ABCPS1234D";
    const name = user?.fullName || user?.username || "Consumer User";
    const mobile = user?.mobile || "9876543210";
    const cibilScore = creditProfile?.cibilScore || 750;
    const monthlyIncome = creditProfile?.monthlyIncome || user?.monthlyIncome || 75000;
    const monthlyObligations = creditProfile?.monthlyObligations || user?.monthlyObligations || 15000;

    const appObj = {
      id: appId,
      borrowerName: name,
      pan,
      mobile,
      amount: offer.amount,
      purpose: intent ? intent.purpose.toLowerCase().replace(/[\s_-]+/g, "_") : "personal",
      tenure: offer.tenure,
      cibilScore,
      monthlyIncome,
      monthlyObligations,
      dlaId: "DLA-CONSUMER",
      userId: userIdKey,
      loanIntentId: intent ? intent.id : null,
      offerId: offer.id,
      status: "ROUTED",
      routedTo: lender.id,
      routedAt: new Date(),
      kfsGenerated: true,
      kfsPresentedAt: new Date(),
      kfsAcceptedAt: new Date(),
      aaConsent: true,
    };

    const loanApp = await LoanApplication.create(appObj);
    const kfsData = generateKFS(loanApp.toObject(), lender.toObject());

    const route = await ApplicationRoute.create({
      applicationId: loanApp.id,
      lenderId: lender.id,
      score: 95,
      emi: offer.EMI,
      totalPayable: offer.totalRepayment,
      routedAt: new Date(),
      status: "pending",
      kfsData,
      rejectionReasons: [],
    });

    offer.status = "SELECTED";
    offer.applicationId = loanApp.id;
    await offer.save();

    if (intent) {
      intent.status = "OFFER_SELECTED";
      await intent.save();
    }

    await logCompliance({
      type: "OFFER_SELECTED",
      applicationId: loanApp.id,
      userId: userIdKey,
      actor: user?.username || "user",
      actorRole: "USER",
      pass: true,
      details: { offerId: offer.id, lenderId: lender.id },
    });

    await logCompliance({
      type: "KFS_GENERATED",
      applicationId: loanApp.id,
      userId: userIdKey,
      actor: "SYSTEM",
      actorRole: "SYSTEM",
      pass: true,
      details: { kfsId: kfsData.proposalNumber },
    });

    return res.status(201).json({
      success: true,
      application: loanApp,
      kfsData,
      route,
      message: "Offer selected successfully. KFS snapshot generated and loan routed to lender.",
    });
  })
);

const { sendNotification, getUserNotifications } = require("../services/notificationService");

// GET /api/notifications
router.get(
  "/notifications",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    const notifs = await getUserNotifications(userIdKey);
    return res.json(notifs);
  })
);

const CreditService = require("../services/credit");
const RepaymentSchedule = require("../models/RepaymentSchedule");
const Repayment = require("../models/Repayment");
const { prohibitAdminMutation } = require("../middleware/creditAuthorization");

// GET /api/my-loans or GET /api/loans
router.get(
  ["/my-loans", "/loans"],
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { $or: [{ userId: userIdKey }, { pan: user?.pan }] };
    const total = await LoanApplication.countDocuments(query);
    const apps = await LoanApplication.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);

    // Enhance loans with progress metrics
    const enhancedApps = await Promise.all(
      apps.map(async (app) => {
        const appObj = app.toObject();
        const totalInstallments = await RepaymentSchedule.countDocuments({ loanId: app.id });
        const paidInstallments = await RepaymentSchedule.countDocuments({ loanId: app.id, status: "PAID" });
        const nextPending = await RepaymentSchedule.findOne({
          loanId: app.id,
          status: { $in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
        }).sort({ installmentNumber: 1 });

        return {
          ...appObj,
          installmentsCount: totalInstallments || app.tenure,
          installmentsPaid: paidInstallments,
          nextDueDate: nextPending ? nextPending.dueDate : app.nextDueDate,
          outstandingPrincipal: app.outstandingPrincipal !== undefined ? app.outstandingPrincipal : app.amount,
        };
      })
    );

    return res.json({ apps: enhancedApps, total, page, limit });
  })
);

// GET /api/loans/:id (Get complete loan detail + schedule + repayments)
router.get(
  "/loans/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const userIdentifier = req.user.userId || req.user.sub;
    try {
      const result = await CreditService.getLoanWithSchedule(req.params.id, userIdentifier);
      return res.json(result);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  })
);

// GET /api/loans/:id/repayment-schedule
router.get(
  "/loans/:id/repayment-schedule",
  authenticate,
  asyncHandler(async (req, res) => {
    const userIdentifier = req.user.userId || req.user.sub;
    try {
      const result = await CreditService.getLoanWithSchedule(req.params.id, userIdentifier);
      return res.json({ schedules: result.schedules, summary: result.summary });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  })
);

// POST /api/loans/:id/repay (Process installment or custom repayment)
router.post(
  "/loans/:id/repay",
  authenticate,
  prohibitAdminMutation,
  requireRole("USER", "LENDER", "DLA"),
  asyncHandler(async (req, res) => {
    const userIdentifier = req.user.userId || req.user.sub;
    const { installmentId, amount, paymentMethod, paymentReference, idempotencyKey } = req.body || {};
    const headerKey = req.headers["idempotency-key"] || idempotencyKey;

    try {
      const result = await CreditService.processRepayment({
        loanId: req.params.id,
        installmentId,
        amount: amount !== undefined ? Number(amount) : null,
        userId: userIdentifier,
        paymentMethod: paymentMethod || "UPI_AUTOPAY",
        paymentReference,
        idempotencyKey: headerKey,
      });

      return res.json(result);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  })
);

// POST /api/loans/:id/repayments/:installmentId
router.post(
  "/loans/:id/repayments/:installmentId",
  authenticate,
  prohibitAdminMutation,
  requireRole("USER", "LENDER", "DLA"),
  asyncHandler(async (req, res) => {
    const userIdentifier = req.user.userId || req.user.sub;
    const { amount, paymentMethod, paymentReference, idempotencyKey } = req.body || {};
    const headerKey = req.headers["idempotency-key"] || idempotencyKey;

    try {
      const result = await CreditService.processRepayment({
        loanId: req.params.id,
        installmentId: req.params.installmentId,
        amount: amount !== undefined ? Number(amount) : null,
        userId: userIdentifier,
        paymentMethod: paymentMethod || "UPI_AUTOPAY",
        paymentReference,
        idempotencyKey: headerKey,
      });

      return res.json(result);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  })
);

// POST /api/loans/:id/foreclose (Full settlement)
router.post(
  "/loans/:id/foreclose",
  authenticate,
  prohibitAdminMutation,
  requireRole("USER", "LENDER"),
  asyncHandler(async (req, res) => {
    const userIdentifier = req.user.userId || req.user.sub;
    const { paymentMethod, paymentReference } = req.body || {};

    try {
      const result = await CreditService.processForeclosure({
        loanId: req.params.id,
        userId: userIdentifier,
        paymentMethod: paymentMethod || "UPI_AUTOPAY",
        paymentReference,
      });

      return res.json(result);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code });
    }
  })
);

// GET /api/loans/:id/repayments (Repayment receipts)
router.get(
  "/loans/:id/repayments",
  authenticate,
  asyncHandler(async (req, res) => {
    const repayments = await Repayment.find({ loanId: req.params.id }).sort({ createdAt: -1 });
    return res.json({ repayments });
  })
);

module.exports = router;
