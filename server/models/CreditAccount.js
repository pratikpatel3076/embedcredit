const mongoose = require("mongoose");

/**
 * CreditAccount represents a consumer's credit facility/entitlement.
 * It tracks credit limit, available credit, utilized credit, and reserved credit.
 * IMPORTANT: This represents an authorized borrowing capacity/entitlement,
 * NOT a stored-value wallet or money held by EmbedCredit.
 */
const creditAccountSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    lenderId: { type: String, required: true, index: true },
    lenderProductId: { type: String, default: null, index: true },
    applicationId: { type: String, default: null, index: true },
    creditLimit: { type: Number, required: true, min: 0 },
    availableCredit: { type: Number, required: true, min: 0 },
    utilizedCredit: { type: Number, required: true, default: 0, min: 0 },
    reservedCredit: { type: Number, required: true, default: 0, min: 0 },
    currency: { type: String, default: "INR", uppercase: true },
    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "SUSPENDED", "BLOCKED", "EXPIRED", "CLOSED"],
      default: "ACTIVE",
      index: true,
    },
    version: { type: Number, default: 1 },
    openedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound indexes for high-throughput queries
creditAccountSchema.index({ userId: 1, status: 1 });
creditAccountSchema.index({ lenderId: 1, status: 1 });

// Invariant validation before save
creditAccountSchema.pre("save", function (next) {
  const sum = this.availableCredit + this.utilizedCredit + this.reservedCredit;
  // Account for floating point precision epsilon if any
  if (Math.abs(sum - this.creditLimit) > 0.01) {
    return next(
      new Error(
        `Invariant violation: availableCredit (${this.availableCredit}) + utilizedCredit (${this.utilizedCredit}) + reservedCredit (${this.reservedCredit}) must equal creditLimit (${this.creditLimit})`
      )
    );
  }
  if (this.availableCredit < 0) {
    return next(new Error(`Invariant violation: availableCredit cannot be negative (${this.availableCredit})`));
  }
  this.lastActivityAt = new Date();
  next();
});

creditAccountSchema.set("toJSON", { virtuals: false });
creditAccountSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("CreditAccount", creditAccountSchema);
