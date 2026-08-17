const mongoose = require("mongoose");

const loanIntentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    purpose: {
      type: String,
      required: true,
    },
    requestedAmount: { type: Number, required: true, min: 1000 },
    preferredTenure: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["ACTIVE", "OFFERS_GENERATED", "OFFER_SELECTED", "EXPIRED", "CANCELLED"],
      default: "ACTIVE",
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

loanIntentSchema.set("toJSON", { virtuals: false });
loanIntentSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("LoanIntent", loanIntentSchema);
