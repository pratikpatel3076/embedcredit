const mongoose = require("mongoose");

/**
 * CreditRule represents configurable risk and compliance rules evaluated before credit transactions.
 */
const creditRuleSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true, unique: true, index: true },
    lenderProductId: { type: String, default: null, index: true }, // null applies globally
    ruleType: {
      type: String,
      enum: [
        "MAX_SINGLE_TRANSACTION",
        "MAX_DAILY_UTILIZATION",
        "PERMITTED_PURPOSES",
        "ACCOUNT_STATUS_CHECK",
        "MIN_AVAILABLE_CREDIT",
      ],
      required: true,
    },
    threshold: { type: mongoose.Schema.Types.Mixed, default: {} },
    action: {
      type: String,
      enum: ["ALLOW", "DENY", "FLAG"],
      default: "DENY",
    },
    active: { type: Boolean, default: true, index: true },
    version: { type: Number, default: 1 },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

creditRuleSchema.set("toJSON", { virtuals: false });
creditRuleSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("CreditRule", creditRuleSchema);
