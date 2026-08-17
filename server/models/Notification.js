const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    channel: { type: String, enum: ["IN_APP", "SMS", "EMAIL"], default: "IN_APP" },
    read: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.set("toJSON", { virtuals: false });
notificationSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("Notification", notificationSchema);
