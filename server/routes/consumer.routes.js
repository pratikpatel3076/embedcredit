const express = require("express");
const User = require("../models/User");
const CreditProfile = require("../models/CreditProfile");
const ConsentRecord = require("../models/ConsentRecord");
const LoanIntent = require("../models/LoanIntent");
const LoanOffer = require("../models/LoanOffer");
const LoanApplication = require("../models/LoanApplication");
const LenderProduct = require("../models/LenderProduct");
const ApplicationRoute = require("../models/ApplicationRoute");
const { authenticate } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const { nextIntentId, nextOfferId, nextApplicationId, nextConsentId } = require("../utils/idGenerator");
const { matchMarketplaceOffers } = require("../services/creditEngine");
const { generateKFS } = require("../services/kfsGenerator");
const { logCompliance } = require("../middleware/rbiCompliance");
const bureauService = require("../services/bureauService");
const aaService = require("../services/aaService");

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

    const consentId = await nextConsentId();
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 30);

    await ConsentRecord.create({
      id: consentId,
      userId: userIdKey,
      consentType: "BUREAU_PULL",
      purpose: "Bureau credit score pull for loan eligibility matching",
      provider: "CIBIL / TransUnion",
      status: "ACTIVE",
      grantedAt: new Date(),
      expiresAt: expDate,
    });

    await logCompliance({
      type: "BUREAU_PULL",
      userId: userIdKey,
      actor: user.username,
      actorRole: "USER",
      pass: true,
      details: { cibilScore: pullResult.cibilScore },
    });

    return res.json({ profile, bureauData: pullResult });
  })
);

// GET /api/consents
router.get(
  "/consents",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    const consents = await ConsentRecord.find({ userId: userIdKey }).sort({ createdAt: -1 });
    return res.json(consents);
  })
);

// POST /api/consents
router.post(
  "/consents",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    const { consentType, purpose, provider } = req.body || {};

    const consentId = await nextConsentId();
    const expDate = new Date();
    expDate.setFullYear(expDate.getFullYear() + 1);

    const consent = await ConsentRecord.create({
      id: consentId,
      userId: userIdKey,
      consentType: consentType || "AA_DATA",
      purpose: purpose || "Bank statement analysis and income verification",
      provider: provider || "Account Aggregator Ecosystem",
      status: "ACTIVE",
      grantedAt: new Date(),
      expiresAt: expDate,
    });

    await logCompliance({
      type: consentType === "AA_DATA" ? "AA_CONSENT_GRANTED" : "AA_CONSENT",
      userId: userIdKey,
      actor: user.username,
      actorRole: "USER",
      pass: true,
      details: { consentId: consent.id, consentType: consent.consentType },
    });

    return res.status(201).json(consent);
  })
);

// POST /api/loan-intents
router.post(
  "/loan-intents",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    const { purpose, requestedAmount, preferredTenure } = req.body || {};

    if (!purpose || !requestedAmount || !preferredTenure) {
      return res.status(400).json({ error: "purpose, requestedAmount, and preferredTenure are required" });
    }

    const intentId = await nextIntentId();
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 30);

    const intent = await LoanIntent.create({
      id: intentId,
      userId: userIdKey,
      purpose,
      requestedAmount: Number(requestedAmount),
      preferredTenure: Number(preferredTenure),
      status: "ACTIVE",
      expiresAt: expDate,
    });

    return res.status(201).json({ intent, message: "Credit intent registered successfully" });
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
  asyncHandler(async (req, res) => {
    const intent = await LoanIntent.findOne({ id: req.params.id });
    if (!intent) return res.status(404).json({ error: "Loan intent not found" });

    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    let creditProfile = await CreditProfile.findOne({ userId: userIdKey });
    if (!creditProfile) {
      creditProfile = { cibilScore: 750, monthlyIncome: user?.monthlyIncome || 60000, monthlyObligations: user?.monthlyObligations || 12000 };
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
    const offers = await LoanOffer.find({ loanIntentId: req.params.id }).sort({ interestRate: 1 });
    return res.json(offers);
  })
);

// POST /api/offers/:id/select
router.post(
  "/offers/:id/select",
  authenticate,
  asyncHandler(async (req, res) => {
    const offer = await LoanOffer.findOne({ id: req.params.id });
    if (!offer) return res.status(404).json({ error: "Offer not found" });

    const intent = await LoanIntent.findOne({ id: offer.loanIntentId });
    const user = await User.findById(req.user.sub);
    const userIdKey = user?.userId || req.user.sub;
    const lender = await LenderProduct.findOne({ id: offer.lenderProductId });

    if (!lender) return res.status(404).json({ error: "Lender product unavailable" });

    const appId = await nextApplicationId();
    const pan = user?.pan || "ABCPS1234D";
    const name = user?.fullName || user?.username || "Consumer User";
    const mobile = user?.mobile || "9876543210";

    const appObj = {
      id: appId,
      borrowerName: name,
      pan,
      mobile,
      amount: offer.amount,
      purpose: intent ? intent.purpose.toLowerCase().replace(/\s+/g, "_") : "personal",
      tenure: offer.tenure,
      cibilScore: 750,
      monthlyIncome: user?.monthlyIncome || 60000,
      monthlyObligations: user?.monthlyObligations || 12000,
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
      actor: user.username,
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

// GET /api/my-loans
router.get(
  "/my-loans",
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

    return res.json({ apps, total, page, limit });
  })
);

module.exports = router;
