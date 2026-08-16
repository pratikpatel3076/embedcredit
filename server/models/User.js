const mongoose = require("mongoose");

// User — platform accounts for the three roles: DLA, LENDER, ADMIN.
// DLA users are bound to a dlaId; LENDER users to a lenderId (their product id).
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["DLA", "LENDER", "ADMIN"], required: true },
  dlaId: { type: String, default: null },
  lenderId: { type: String, default: null },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

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
