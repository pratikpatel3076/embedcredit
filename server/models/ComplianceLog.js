const mongoose = require("mongoose");

// ComplianceLog — audit trail for every RBI compliance gate evaluated.
const complianceLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "USER_REGISTERED",
      "PROFILE_UPDATED",
      "AA_CONSENT_GRANTED",
      "AA_CONSENT_REVOKED",
      "BUREAU_PULL",
      "ELIGIBILITY_EVALUATED",
      "OFFER_GENERATED",
      "OFFER_SELECTED",
      "KFS_GENERATED",
      "KFS_ACCEPTED",
      "KFS_BEFORE_ROUTING",
      "FLDG_CAP_CHECK",
      "ROUTE_BLOCKED_DLG_CAP",
      "ROUTE_CREATED",
      "LENDER_APPROVED",
      "LENDER_REJECTED",
      "KFS_BEFORE_DISBURSAL",
      "DISBURSAL_RECORDED",
      // Legacy compatibility
      "FLDG_CAP",
      "AA_CONSENT",
    ],
    required: true,
  },
  applicationId: { type: String, default: null, index: true },
  userId: { type: String, default: null, index: true },
  actor: { type: String, default: "SYSTEM" },
  actorRole: { type: String, default: "SYSTEM" },
  requestId: { type: String, default: null },
  pass: { type: Boolean, required: true },
  previousState: { type: String, default: null },
  newState: { type: String, default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

complianceLogSchema.set("toJSON", { virtuals: false });
complianceLogSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("ComplianceLog", complianceLogSchema);
