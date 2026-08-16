// ── RBI compliance gates (FLDG + KFS ordering) ──────────────────
// Enforces:
//   1. KFS must be generated BEFORE routing is executed (kfsBeforeRouting).
//   2. Disbursal only after status === 'routed' AND kfsGenerated === true.
//   3. FLDG exposure per lender <= FLDG_CAP * that lender's portfolio value.
// Every check is logged to ComplianceLog.
const LoanApplication = require("../models/LoanApplication");
const ComplianceLog = require("../models/ComplianceLog");
const { FLDG_CAP } = require("../config/constants");

async function logCompliance({ type, applicationId, pass, details = {} }) {
  try {
    await ComplianceLog.create({ type, applicationId, pass, details });
  } catch (e) {
    console.error("[compliance] failed to write log:", e.message);
  }
}

// Gate: the /route action may only run when the KFS has NOT yet been
// generated. Routing is the single action that generates the KFS, so a
// second routing attempt (or any attempt on an already-generated KFS) is
// blocked. Requires req.application (set by canAccessApplication).
async function kfsBeforeRouting(req, res, next) {
  const app = req.application;
  const pass =
    app.kfsGenerated === false &&
    ["new", "pending_review"].includes(app.status);

  await logCompliance({
    type: "KFS_BEFORE_ROUTING",
    applicationId: app.id,
    pass,
    details: { status: app.status, kfsGenerated: app.kfsGenerated },
  });

  if (!pass) {
    return res.status(409).json({
      error:
        "KFS must be generated exactly once, before routing. This application has already been routed.",
    });
  }
  next();
}

// Gate: disbursal only when the application was routed and its KFS exists.
async function kfsBeforeDisbursal(req, res, next) {
  const app = req.application;
  const pass = app.status === "routed" && app.kfsGenerated === true;

  await logCompliance({
    type: "KFS_BEFORE_DISBURSAL",
    applicationId: app.id,
    pass,
    details: { status: app.status, kfsGenerated: app.kfsGenerated },
  });

  if (!pass) {
    return res.status(409).json({
      error:
        "Disbursal blocked: application must be routed and a KFS generated before disbursal.",
    });
  }
  next();
}

// Aggregate the lender's routed + disbursed portfolio value on-platform.
async function getLenderPortfolio(lenderId) {
  const apps = await LoanApplication.find({
    routedTo: lenderId,
    status: { $in: ["routed", "disbursed"] },
  });
  const disbursed = apps.filter((a) => a.status === "disbursed");
  return {
    applicationCount: apps.length,
    portfolioValue: apps.reduce((s, a) => s + a.amount, 0),
    disbursedValue: disbursed.reduce((s, a) => s + a.amount, 0),
  };
}

// FLDG check before routing a NEW loan to a lender. The projected FLDG
// exposure (FLDG_CAP x loan amount on top of current funded book) must not
// exceed FLDG_CAP x projected portfolio value.
async function fldgCapCheck(req, res, next) {
  const app = req.application;
  const lenderId = (req.body || {}).lenderId;
  const { portfolioValue, disbursedValue } = await getLenderPortfolio(lenderId);

  const projectedPortfolio = portfolioValue + app.amount;
  const projectedExposure = FLDG_CAP * (disbursedValue + app.amount);
  const capLimit = FLDG_CAP * projectedPortfolio;
  const pass = projectedExposure <= capLimit;

  await logCompliance({
    type: "FLDG_CAP",
    applicationId: app.id,
    pass,
    details: {
      lenderId,
      projectedExposure,
      capLimit,
      cap: FLDG_CAP,
      portfolioValue,
      disbursedValue,
    },
  });

  if (!pass) {
    return res.status(409).json({
      error: `FLDG exposure would exceed ${(FLDG_CAP * 100).toFixed(0)}% of the lender's portfolio value.`,
    });
  }
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
