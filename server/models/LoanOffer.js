const mongoose = require("mongoose");

const loanOfferSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    loanIntentId: { type: String, required: true, index: true },
    applicationId: { type: String, default: null },
    lenderProductId: { type: String, required: true },
    lenderId: { type: String, required: true },
    lenderName: { type: String, required: true },
    amount: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    APR: { type: Number, required: true },
    tenure: { type: Number, required: true },
    EMI: { type: Number, required: true },
    processingFee: { type: Number, required: true },
    totalRepayment: { type: Number, required: true },
    disbursalTime: { type: String, required: true },
    eligibilityReasons: { type: [String], default: [] },
    ineligibilityReasons: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["GENERATED", "SELECTED", "EXPIRED", "REJECTED"],
      default: "GENERATED",
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

loanOfferSchema.set("toJSON", { virtuals: false });
loanOfferSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("LoanOffer", loanOfferSchema);
