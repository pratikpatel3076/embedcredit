const mongoose = require("mongoose");

const creditProfileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    cibilScore: { type: Number, min: 300, max: 900, default: null },
    monthlyIncome: { type: Number, default: 0 },
    monthlyObligations: { type: Number, default: 0 },
    dti: { type: Number, default: 0 },
    employmentType: { type: String, default: "salaried" },
    bureauStatus: {
      type: String,
      enum: ["NOT_PULLED", "PULLED", "FAILED"],
      default: "NOT_PULLED",
    },
    bureauLastPulledAt: { type: Date, default: null },
    aaStatus: {
      type: String,
      enum: ["NOT_CONNECTED", "CONNECTED", "EXPIRED"],
      default: "NOT_CONNECTED",
    },
    creditUtilization: { type: Number, default: 0 },
    profileCompleteness: { type: Number, default: 0 },
    lastEvaluatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

creditProfileSchema.set("toJSON", { virtuals: false });
creditProfileSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("CreditProfile", creditProfileSchema);
