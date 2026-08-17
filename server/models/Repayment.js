const mongoose = require("mongoose");

/**
 * Repayment represents an executed payment transaction against a loan / installment.
 * Contains principal/interest breakdown and payment references.
 */
const repaymentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    loanId: { type: String, required: true, index: true },
    installmentId: { type: String, default: null, index: true },
    creditAccountId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    principalComponent: { type: Number, required: true, min: 0 },
    interestComponent: { type: Number, default: 0, min: 0 },
    feeComponent: { type: Number, default: 0, min: 0 },
    paymentReference: { type: String, required: true },
    status: {
      type: String,
      enum: ["INITIATED", "SUCCESS", "FAILED", "REVERSED"],
      default: "SUCCESS",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["UPI_AUTOPAY", "NET_BANKING", "DEBIT_CARD", "ENACH", "MANUAL"],
      default: "UPI_AUTOPAY",
    },
    idempotencyKey: { type: String, default: null, index: true },
    paidAt: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

repaymentSchema.index({ loanId: 1, createdAt: -1 });
repaymentSchema.index({ userId: 1, createdAt: -1 });

repaymentSchema.set("toJSON", { virtuals: false });
repaymentSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("Repayment", repaymentSchema);
