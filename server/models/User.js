const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["USER", "DLA", "LENDER", "ADMIN"], required: true },
    dlaId: { type: String, default: null },
    lenderId: { type: String, default: null },
    userId: { type: String, unique: true, sparse: true, index: true },
    fullName: { type: String, default: "" },
    email: { type: String, default: "" },
    mobile: { type: String, default: "", index: true },
    pan: { type: String, uppercase: true, trim: true, default: "", index: true },
    dateOfBirth: { type: String, default: "" },
    address: { type: String, default: "" },
    employmentType: { type: String, default: "salaried" },
    employerName: { type: String, default: "" },
    monthlyIncome: { type: Number, default: 0 },
    monthlyObligations: { type: Number, default: 0 },
    profileCompletion: { type: Number, default: 0 },
    kycStatus: { type: String, enum: ["NOT_STARTED", "PENDING", "VERIFIED"], default: "NOT_STARTED" },
    accountStatus: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform(doc, ret) {
    delete ret.passwordHash;
    return ret;
  },
});
userSchema.set("toObject", {
  transform(doc, ret) {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
