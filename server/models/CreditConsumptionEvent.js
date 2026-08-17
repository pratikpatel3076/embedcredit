const mongoose = require("mongoose");

/**
 * CreditConsumptionEvent represents an immutable append-only event in the credit ledger.
 * Every modification to a CreditAccount MUST have an associated event.
 */
const creditConsumptionEventSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    eventId: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, default: null },
    creditAccountId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    applicationId: { type: String, default: null, index: true },
    loanId: { type: String, default: null, index: true },
    eventType: {
      type: String,
      enum: [
        "CREDIT_GRANTED",
        "CREDIT_RESERVED",
        "CREDIT_CONSUMED",
        "CREDIT_RELEASED",
        "CREDIT_REPAID",
        "CREDIT_REVERSED",
        "CREDIT_EXPIRED",
        "CREDIT_ADJUSTMENT",
      ],
      required: true,
      index: true,
    },
    units: { type: Number, default: 1 },
    creditAmount: { type: Number, required: true, min: 0 },
    balanceAfter: {
      creditLimit: { type: Number, default: 0 },
      availableCredit: { type: Number, default: 0 },
      utilizedCredit: { type: Number, default: 0 },
      reservedCredit: { type: Number, default: 0 },
    },
    source: {
      type: String,
      enum: [
        "DLA",
        "CONSUMER_PORTAL",
        "CHECKOUT_GATEWAY",
        "LENDER_SYNC",
        "SYSTEM",
        "FACILITY_DRAWDOWN",
        "REPAYMENT_SERVICE",
        "FORECLOSURE_SETTLEMENT",
        "LENDER_APPROVAL",
      ],
      default: "CONSUMER_PORTAL",
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["SUCCESS", "PENDING", "REVERSED", "FAILED"],
      default: "SUCCESS",
      index: true,
    },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } } // Immutable: no updatedAt modification
);

// Unique index on idempotency key when provided
creditConsumptionEventSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

// High-throughput query indexes
creditConsumptionEventSchema.index({ creditAccountId: 1, createdAt: -1 });
creditConsumptionEventSchema.index({ userId: 1, createdAt: -1 });
creditConsumptionEventSchema.index({ eventType: 1, createdAt: -1 });

creditConsumptionEventSchema.set("toJSON", { virtuals: false });
creditConsumptionEventSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("CreditConsumptionEvent", creditConsumptionEventSchema);
