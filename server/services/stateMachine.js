const LoanApplication = require("../models/LoanApplication");
const ApplicationRoute = require("../models/ApplicationRoute");
const LenderProduct = require("../models/LenderProduct");
const { logCompliance, FLDG_CAP, getLenderPortfolio } = require("../middleware/rbiCompliance");
const { dispatchWebhook } = require("./webhookService");

class StateMachineError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const ALLOWED_TRANSITIONS = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["ELIGIBILITY_CHECK", "OFFERS_AVAILABLE", "ROUTED", "REJECTED", "CANCELLED"],
  ELIGIBILITY_CHECK: ["OFFERS_AVAILABLE", "REJECTED", "CANCELLED"],
  OFFERS_AVAILABLE: ["OFFER_SELECTED", "EXPIRED", "CANCELLED"],
  OFFER_SELECTED: ["KFS_GENERATED", "KFS_ACCEPTED", "ROUTED", "CANCELLED"],
  KFS_GENERATED: ["KFS_ACCEPTED", "CANCELLED"],
  KFS_ACCEPTED: ["ROUTED", "LENDER_REVIEW", "CANCELLED"],
  ROUTED: ["LENDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  LENDER_REVIEW: ["APPROVED", "REJECTED", "WITHDRAWN"],
  APPROVED: ["DISBURSAL_PENDING", "DISBURSED", "CANCELLED"],
  DISBURSAL_PENDING: ["DISBURSED", "CANCELLED"],
  DISBURSED: ["ACTIVE", "CLOSED"],
  ACTIVE: ["CLOSED"],
  // Legacy compatibility
  new: ["pending_review", "routed", "rejected"],
  pending_review: ["routed", "rejected"],
  routed: ["disbursed", "rejected"],
};

function canTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return true;
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

async function transitionApplication(appId, targetStatus, actorUser, metadata = {}) {
  const app = await LoanApplication.findOne({ id: appId });
  if (!app) {
    throw new StateMachineError("APPLICATION_NOT_FOUND", `Application ${appId} not found`, 404);
  }

  const currentStatus = app.status;

  if (!canTransition(currentStatus, targetStatus)) {
    throw new StateMachineError(
      "INVALID_STATE_TRANSITION",
      `Cannot transition application from '${currentStatus}' to '${targetStatus}'`,
      400
    );
  }

  // Pre-condition validations per target state
  if (targetStatus === "ROUTED" || targetStatus === "routed") {
    if (!app.aaConsent) {
      throw new StateMachineError("AA_CONSENT_REQUIRED", "Valid Account Aggregator consent required before routing", 400);
    }
    if (!app.kfsGenerated) {
      throw new StateMachineError("KFS_REQUIRED", "Key Fact Statement (KFS) must be generated prior to routing", 400);
    }

    const lenderId = metadata.lenderId || app.routedTo;
    if (!lenderId) {
      throw new StateMachineError("UNAUTHORIZED_LENDER", "Target lender ID is required for routing", 400);
    }

    // FLDG Cap Check
    const { portfolioValue, disbursedValue } = await getLenderPortfolio(lenderId);
    const projectedPortfolio = portfolioValue + app.amount;
    const projectedExposure = FLDG_CAP * (disbursedValue + app.amount);
    const capLimit = FLDG_CAP * projectedPortfolio;

    if (projectedExposure > capLimit) {
      await logCompliance({
        type: "ROUTE_BLOCKED_DLG_CAP",
        applicationId: app.id,
        userId: app.userId,
        actor: actorUser.username || "SYSTEM",
        actorRole: actorUser.role || "SYSTEM",
        pass: false,
        details: { lenderId, projectedExposure, capLimit },
      });
      throw new StateMachineError("FLDG_CAP_EXCEEDED", `ROUTE_BLOCKED_DLG_CAP: FLDG exposure exceeds 5% portfolio limit for ${lenderId}`, 409);
    }

    app.routedTo = lenderId;
    app.routedAt = new Date();
  }

  if (targetStatus === "APPROVED") {
    if (actorUser.role !== "LENDER") {
      throw new StateMachineError("UNAUTHORIZED_ROLE", "Only assigned Lending Partner can approve loan applications", 403);
    }
    if (app.routedTo && actorUser.lenderId && app.routedTo !== actorUser.lenderId) {
      throw new StateMachineError("UNAUTHORIZED_LENDER", "Lender account not authorized for this assigned loan", 403);
    }
  }

  if (targetStatus === "REJECTED") {
    if (actorUser.role !== "LENDER") {
      throw new StateMachineError("UNAUTHORIZED_ROLE", "Only assigned Lending Partner can decline loan applications", 403);
    }
    if (!metadata.rejectionReasonCode) {
      throw new StateMachineError("REJECTION_REASON_REQUIRED", "Structured rejectionReasonCode is required", 400);
    }
  }

  if (targetStatus === "DISBURSED" || targetStatus === "disbursed") {
    if (!["routed", "ROUTED", "APPROVED", "DISBURSAL_PENDING"].includes(currentStatus)) {
      throw new StateMachineError("INVALID_STATE_TRANSITION", "Disbursal requires application to be in routed or approved state", 400);
    }
    if (!app.kfsGenerated) {
      throw new StateMachineError("KFS_REQUIRED", "Disbursal blocked: application must have a generated KFS", 409);
    }
  }

  // Update application
  app.status = targetStatus;
  if (metadata.rejectionReasonCode) {
    app.rejectionReasonCode = metadata.rejectionReasonCode;
    app.rejectionReasonText = metadata.rejectionReasonText || "";
    app.declineExplanation = metadata.declineExplanation || "";
  }
  await app.save();

  // Sync route status
  if (targetStatus === "APPROVED") {
    await ApplicationRoute.updateOne({ applicationId: app.id }, { $set: { status: "accepted" } });
  } else if (targetStatus === "REJECTED") {
    await ApplicationRoute.updateOne({ applicationId: app.id }, { $set: { status: "rejected", rejectionReasons: [app.declineExplanation] } });
  } else if (["disbursed", "DISBURSED"].includes(targetStatus)) {
    await ApplicationRoute.updateOne({ applicationId: app.id }, { $set: { status: "disbursed" } });
  }

  // Compliance log & webhook
  await logCompliance({
    type: targetStatus === "APPROVED" ? "LENDER_APPROVED" : targetStatus === "REJECTED" ? "LENDER_REJECTED" : targetStatus === "DISBURSED" ? "DISBURSAL_RECORDED" : "STATE_TRANSITION",
    applicationId: app.id,
    userId: app.userId,
    actor: actorUser.username || "SYSTEM",
    actorRole: actorUser.role || "SYSTEM",
    pass: true,
    previousState: currentStatus,
    newState: targetStatus,
    details: metadata,
  });

  const webhookEventMap = {
    APPROVED: "loan.approved",
    REJECTED: "loan.rejected",
    DISBURSED: "loan.disbursed",
    disbursed: "loan.disbursed",
    ROUTED: "loan.routed",
    routed: "loan.routed",
  };

  if (webhookEventMap[targetStatus]) {
    dispatchWebhook({
      dlaId: app.dlaId,
      eventType: webhookEventMap[targetStatus],
      resourceId: app.id,
      payload: { applicationId: app.id, status: targetStatus, ...metadata },
    });
  }

  return app;
}

module.exports = { transitionApplication, StateMachineError, canTransition, ALLOWED_TRANSITIONS };
