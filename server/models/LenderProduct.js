const mongoose = require("mongoose");

// LenderProduct mirrors the frontend LENDER_PRODUCTS mock exactly,
// plus the OCEN / AA / NACH integration flags shown on the Lenders page.
const lenderProductSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true, required: true, index: true },
    lenderName: { type: String, required: true },
    type: { type: String, enum: ["Bank", "NBFC"], required: true },
    minAmount: { type: Number, required: true },
    maxAmount: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    APR: { type: Number, default: 15.0 },
    tenureMonths: { type: [Number], required: true },
    minCibilScore: { type: Number, required: true },
    maxDti: { type: Number, required: true },
    minIncome: { type: Number, default: 15000 },
    processingFee: { type: Number, required: true },
    disbursalTime: { type: String, required: true },
    supportedPurposes: { type: [String], required: true },
    employmentTypes: { type: [String], default: ["salaried", "self_employed", "business"] },
    eligibilityRules: { type: mongoose.Schema.Types.Mixed, default: {} },
    ocenEnabled: { type: Boolean, default: false },
    aaEnabled: { type: Boolean, default: false },
    nachEnabled: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

lenderProductSchema.set("toJSON", { virtuals: false });
lenderProductSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("LenderProduct", lenderProductSchema);
