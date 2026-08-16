const mongoose = require("mongoose");

// LoanApplication mirrors the frontend INITIAL_APPLICATIONS mock exactly.
// `id` (e.g. "APP-001") is an explicit business key, unique per document.
const loanApplicationSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true, index: true },
  borrowerName: { type: String, required: true, trim: true },
  pan: {
    type: String,
    required: true,
    uppercase: true,
    match: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  },
  mobile: { type: String, required: true, match: /^[6-9]\d{9}$/ },
  amount: { type: Number, required: true, min: 5000 },
  purpose: {
    type: String,
    required: true,
    enum: [
      "personal",
      "consumer",
      "education",
      "medical",
      "emergency",
      "sme",
      "working_capital",
    ],
  },
  tenure: { type: Number, required: true },
  cibilScore: { type: Number, required: true, min: 300, max: 900 },
  monthlyIncome: { type: Number, required: true },
  monthlyObligations: { type: Number, default: 0 },
  dlaId: { type: String, required: true },
  status: {
    type: String,
    enum: ["new", "pending_review", "routed", "disbursed", "rejected"],
    default: "new",
  },
  routedTo: { type: String, ref: "LenderProduct", default: null },
  routedAt: { type: Date, default: null },
  kfsGenerated: { type: Boolean, default: false },
  aaConsent: { type: Boolean, required: true },
  createdAt: { type: Date, default: Date.now },
});

loanApplicationSchema.set("toJSON", { virtuals: false });
loanApplicationSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("LoanApplication", loanApplicationSchema);
