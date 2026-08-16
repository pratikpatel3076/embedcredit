const mongoose = require("mongoose");

// LenderProduct mirrors the frontend LENDER_PRODUCTS mock exactly,
// plus the OCEN / AA / NACH integration flags shown on the Lenders page.
const lenderProductSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true, index: true },
  lenderName: { type: String, required: true },
  type: { type: String, enum: ["Bank", "NBFC"], required: true },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  interestRate: { type: Number, required: true },
  tenureMonths: { type: [Number], required: true },
  minCibilScore: { type: Number, required: true },
  maxDti: { type: Number, required: true },
  processingFee: { type: Number, required: true },
  disbursalTime: { type: String, required: true },
  supportedPurposes: { type: [String], required: true },
  ocenEnabled: { type: Boolean, default: false },
  aaEnabled: { type: Boolean, default: false },
  nachEnabled: { type: Boolean, default: false },
});

lenderProductSchema.set("toJSON", { virtuals: false });
lenderProductSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("LenderProduct", lenderProductSchema);
