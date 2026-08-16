const mongoose = require("mongoose");

// BorrowerProfile — PAN is the only identity key stored. No Aadhaar anywhere.
const bankStatementSummarySchema = new mongoose.Schema(
  {
    avgMonthlyCredit: { type: Number, default: 0 },
    avgBalance: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 },
  },
  { _id: false }
);

const borrowerProfileSchema = new mongoose.Schema({
  pan: { type: String, unique: true, required: true, uppercase: true, index: true },
  name: { type: String, required: true },
  mobile: { type: String, required: true },
  cibilScore: { type: Number, min: 300, max: 900, default: null },
  cibilPulledAt: { type: Date, default: null },
  aaConsentActive: { type: Boolean, default: false },
  aaConsentExpiry: { type: Date, default: null },
  bankStatementSummary: { type: bankStatementSummarySchema, default: () => ({}) },
  activeLoans: { type: Number, default: 0 },
  totalExistingEmi: { type: Number, default: 0 },
});

borrowerProfileSchema.set("toJSON", { virtuals: false });
borrowerProfileSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("BorrowerProfile", borrowerProfileSchema);
