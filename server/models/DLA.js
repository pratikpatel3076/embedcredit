const mongoose = require("mongoose");

const dlaSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true, index: true },
    apiSecret: { type: String, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },
    associatedLenders: { type: [String], default: [] },
    webhookUrl: { type: String, default: "" },
    webhookSecret: { type: String, default: "" },
    allowedScopes: {
      type: [String],
      default: ["applications:create", "applications:read", "eligibility:check", "offers:select"],
    },
    rateLimit: { type: Number, default: 100 }, // req/min
  },
  { timestamps: true }
);

dlaSchema.set("toJSON", {
  transform(doc, ret) {
    delete ret.apiSecret;
    delete ret.webhookSecret;
    return ret;
  },
});

module.exports = mongoose.model("DLA", dlaSchema);
