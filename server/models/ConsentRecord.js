const mongoose = require("mongoose");

const consentRecordSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    consentType: {
      type: String,
      enum: ["AA_DATA", "BUREAU_PULL", "DATA_PROCESSING", "LENDER_DATA_SHARING"],
      required: true,
    },
    purpose: { type: String, required: true },
    provider: { type: String, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED", "EXPIRED", "PENDING"],
      default: "ACTIVE",
    },
    version: { type: String, default: "1.0" },
    grantedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

consentRecordSchema.set("toJSON", { virtuals: false });
consentRecordSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("ConsentRecord", consentRecordSchema);
