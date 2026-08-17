const mongoose = require("mongoose");

const webhookLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    dlaId: { type: String, required: true, index: true },
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: {
      type: String,
      enum: [
        "application.created",
        "application.updated",
        "offer.created",
        "offer.expired",
        "offer.selected",
        "kfs.generated",
        "kfs.accepted",
        "loan.routed",
        "loan.approved",
        "loan.rejected",
        "loan.disbursed",
        "loan.closed",
      ],
      required: true,
    },
    resourceId: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING"],
      default: "PENDING",
    },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    responseCode: { type: Number, default: null },
    responseBody: { type: String, default: "" },
  },
  { timestamps: true }
);

webhookLogSchema.set("toJSON", { virtuals: false });
webhookLogSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("WebhookLog", webhookLogSchema);
