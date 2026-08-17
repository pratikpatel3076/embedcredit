const mongoose = require("mongoose");

const dlgPortfolioSchema = new mongoose.Schema(
  {
    lenderId: { type: String, required: true, index: true },
    lenderProductId: { type: String, required: true, unique: true, index: true },
    portfolioOutstanding: { type: Number, default: 0 },
    disbursedOutstanding: { type: Number, default: 0 },
    dlgAmount: { type: Number, default: 0 },
    dlgCap: { type: Number, default: 0.05 }, // 5% RBI limit
    utilization: { type: Number, default: 0 }, // %
    availableCapacity: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["COMPLIANT", "BREACH", "BLOCKED"],
      default: "COMPLIANT",
    },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date, default: null },
  },
  { timestamps: true }
);

dlgPortfolioSchema.set("toJSON", { virtuals: false });
dlgPortfolioSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("DLGPortfolio", dlgPortfolioSchema);
