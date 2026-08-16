const mongoose = require("mongoose");

// ComplianceLog — audit trail for every RBI compliance gate evaluated.
const complianceLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["KFS_BEFORE_ROUTING", "KFS_BEFORE_DISBURSAL", "FLDG_CAP", "AA_CONSENT", "BUREAU_PULL"],
    required: true,
  },
  applicationId: { type: String, default: null },
  pass: { type: Boolean, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

complianceLogSchema.set("toJSON", { virtuals: false });
complianceLogSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("ComplianceLog", complianceLogSchema);
