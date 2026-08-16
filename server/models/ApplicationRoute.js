const mongoose = require("mongoose");

// ApplicationRoute is the routing ledger entry for one application -> one lender.
// kfsData holds the full KFS snapshot (generated BEFORE the route is persisted).
const applicationRouteSchema = new mongoose.Schema({
  applicationId: { type: String, ref: "LoanApplication", required: true, unique: true, index: true },
  lenderId: { type: String, ref: "LenderProduct", required: true },
  score: { type: Number, default: 0 },
  emi: { type: Number, default: null },
  totalPayable: { type: Number, default: null },
  routedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "disbursed"],
    default: "pending",
  },
  kfsData: { type: mongoose.Schema.Types.Mixed, default: null },
  rejectionReasons: { type: [String], default: [] },
});

applicationRouteSchema.set("toJSON", { virtuals: false });
applicationRouteSchema.set("toObject", { virtuals: false });

module.exports = mongoose.model("ApplicationRoute", applicationRouteSchema);
