const LoanApplication = require("../models/LoanApplication");
const ComplianceLog = require("../models/ComplianceLog");
const DLGPortfolio = require("../models/DLGPortfolio");
const { FLDG_CAP } = require("../config/constants");

async function logCompliance({
  type,
  applicationId = null,
  userId = null,
  actor = "SYSTEM",
  actorRole = "SYSTEM",
  requestId = null,
  pass = true,
  previousState = null,
  newState = null,
  details = {},
}) {
  try {
    await ComplianceLog.create({
      type,
      applicationId,
      userId,
      actor,
      actorRole,
      requestId,
      pass,
      previousState,
      newState,
      details,
    });
  } catch (e) {
    console.error("[compliance] failed to write log:", e.message);
  }
}

// Gate: the /route action may only run when the KFS has NOT yet been generated.
async function kfsBeforeRouting(req, res, next) {
  const app = req.application;
  const pass =
    app.kfsGenerated === false &&
    ["new", "pending_review", "OFFER_SELECTED", "KFS_ACCEPTED", "SUBMITTED"].includes(app.status);

  await logCompliance({
    type: "KFS_BEFORE_ROUTING",
    applicationId: app.id,
    userId: app.userId,
    actor: req.user?.username || "SYSTEM",
    actorRole: req.user?.role || "SYSTEM",
    pass,
    details: { status: app.status, kfsGenerated: app.kfsGenerated },
  });

  if (!pass) {
    return res.status(409).json({
      error: "KFS must be generated prior to routing. Application has already been routed.",
    });
  }
  next();
}

// Gate: disbursal only when application was routed and KFS exists.
async function kfsBeforeDisbursal(req, res, next) {
  const app = req.application;
  const pass = ["routed", "ROUTED", "APPROVED", "DISBURSAL_PENDING"].includes(app.status) && app.kfsGenerated === true;

  await logCompliance({
    type: "KFS_BEFORE_DISBURSAL",
    applicationId: app.id,
    userId: app.userId,
    actor: req.user?.username || "SYSTEM",
    actorRole: req.user?.role || "SYSTEM",
    pass,
    details: { status: app.status, kfsGenerated: app.kfsGenerated },
  });

  if (!pass) {
    return res.status(409).json({
      error: "Disbursal blocked: application must be routed/approved and a KFS generated before disbursal.",
    });
  }
  next();
}

// Aggregate lender's portfolio value.
async function getLenderPortfolio(lenderId) {
  const apps = await LoanApplication.find({
    routedTo: lenderId,
    status: { $in: ["routed", "disbursed", "ROUTED", "DISBURSED", "APPROVED", "ACTIVE"] },
  });
  const disbursed = apps.filter((a) => ["disbursed", "DISBURSED", "ACTIVE"].includes(a.status));
  const totalValue = apps.reduce((s, a) => s + a.amount, 0);
  const disbursedValue = disbursed.reduce((s, a) => s + a.amount, 0);

  // Sync DLGPortfolio record
  let portfolioRecord = await DLGPortfolio.findOne({ lenderProductId: lenderId });
  if (!portfolioRecord) {
    portfolioRecord = await DLGPortfolio.create({
      lenderId,
      lenderProductId: lenderId,
      portfolioOutstanding: totalValue,
      disbursedOutstanding: disbursedValue,
      dlgAmount: FLDG_CAP * disbursedValue,
      dlgCap: FLDG_CAP,
      utilization: totalValue > 0 ? Math.min(100, Math.round(((FLDG_CAP * disbursedValue) / (FLDG_CAP * totalValue)) * 100)) : 0,
      availableCapacity: Math.max(0, FLDG_CAP * totalValue - FLDG_CAP * disbursedValue),
      status: "COMPLIANT",
    });
  } else {
    portfolioRecord.portfolioOutstanding = totalValue;
    portfolioRecord.disbursedOutstanding = disbursedValue;
    portfolioRecord.dlgAmount = FLDG_CAP * disbursedValue;
    const capLimit = FLDG_CAP * totalValue;
    portfolioRecord.utilization = capLimit > 0 ? Math.min(100, Math.round(((FLDG_CAP * disbursedValue) / capLimit) * 100)) : 0;
    portfolioRecord.availableCapacity = Math.max(0, capLimit - FLDG_CAP * disbursedValue);
    portfolioRecord.status = portfolioRecord.dlgAmount <= capLimit ? "COMPLIANT" : "BREACH";
    await portfolioRecord.save();
  }

  return {
    applicationCount: apps.length,
    portfolioValue: totalValue,
    disbursedValue,
    dlgPortfolio: portfolioRecord,
  };
}

// Portfolio-level FLDG check before routing a loan to a lender.
async function fldgCapCheck(req, res, next) {
  const app = req.application;
  const lenderId = (req.body || {}).lenderId || app.routedTo;
  const { portfolioValue, disbursedValue } = await getLenderPortfolio(lenderId);

  const projectedPortfolio = portfolioValue + app.amount;
  const projectedExposure = FLDG_CAP * (disbursedValue + app.amount);
  const capLimit = FLDG_CAP * projectedPortfolio;
  const pass = projectedExposure <= capLimit;

  if (!pass) {
    await logCompliance({
      type: "ROUTE_BLOCKED_DLG_CAP",
      applicationId: app.id,
      userId: app.userId,
      actor: req.user?.username || "SYSTEM",
      actorRole: req.user?.role || "SYSTEM",
      pass: false,
      details: {
        lenderId,
        projectedExposure,
        capLimit,
        cap: FLDG_CAP,
        portfolioValue,
        disbursedValue,
        message: "FLDG cap breach blocked routing attempt.",
      },
    });

    return res.status(409).json({
      error: `ROUTE_BLOCKED_DLG_CAP: FLDG exposure would exceed ${(FLDG_CAP * 100).toFixed(0)}% of lender portfolio value.`,
    });
  }

  await logCompliance({
    type: "FLDG_CAP_CHECK",
    applicationId: app.id,
    userId: app.userId,
    actor: req.user?.username || "SYSTEM",
    actorRole: req.user?.role || "SYSTEM",
    pass: true,
    details: { lenderId, projectedExposure, capLimit },
  });

  next();
}

module.exports = {
  kfsBeforeRouting,
  kfsBeforeDisbursal,
  fldgCapCheck,
  getLenderPortfolio,
  logCompliance,
  FLDG_CAP,
};
