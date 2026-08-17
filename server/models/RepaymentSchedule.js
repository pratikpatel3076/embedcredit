const mongoose = require("mongoose");

/**
 * RepaymentSchedule represents the installment-by-installment amortization schedule for a loan.
 * It tracks due dates, principal, interest, fees, payment status, and references.
 */
const repaymentScheduleSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    loanId: { type: String, required: true, index: true },
    creditAccountId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    installmentNumber: { type: Number, required: true },
    dueDate: { type: Date, required: true, index: true },
    principalAmount: { type: Number, required: true, min: 0 },
    interestAmount: { type: Number, required: true, min: 0 },
    feeAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "WAIVED"],
      default: "PENDING",
      index: true,
    },
    paidAt: { type: Date, default: null },
    paymentReference: { type: String, default: null },
    repaymentId: { type: String, default: null },
  },
  { timestamps: true }
);

repaymentScheduleSchema.index({ loanId: 1, installmentNumber: 1 }, { unique: true });
repaymentScheduleSchema.index({ userId: 1, status: 1 });
repaymentScheduleSchema.index({ dueDate: 1, status: 1 });

repaymentScheduleSchema.set("toJSON", { virtuals: false });
repaymentScheduleSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("RepaymentSchedule", repaymentScheduleSchema);
