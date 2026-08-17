const LoanApplication = require("../models/LoanApplication");
const LenderProduct = require("../models/LenderProduct");

async function nextApplicationId() {
  const count = await LoanApplication.countDocuments();
  const nextNum = count + 1;
  return `APP-${String(nextNum).padStart(3, "0")}`;
}

async function nextLenderId() {
  const count = await LenderProduct.countDocuments();
  const nextNum = count + 1;
  return `L${String(nextNum).padStart(3, "0")}`;
}

async function nextUserId() {
  const User = require("../models/User");
  const count = await User.countDocuments({ role: "USER" });
  return `USR-${String(count + 1).padStart(3, "0")}`;
}

async function nextIntentId() {
  const LoanIntent = require("../models/LoanIntent");
  const count = await LoanIntent.countDocuments();
  return `INT-${String(count + 1).padStart(3, "0")}`;
}

async function nextOfferId() {
  const LoanOffer = require("../models/LoanOffer");
  const count = await LoanOffer.countDocuments();
  return `OFFER-${String(count + 1).padStart(3, "0")}`;
}

async function nextConsentId() {
  const ConsentRecord = require("../models/ConsentRecord");
  const count = await ConsentRecord.countDocuments();
  return `CNS-${String(count + 1).padStart(3, "0")}`;
}

module.exports = {
  nextApplicationId,
  nextLenderId,
  nextUserId,
  nextIntentId,
  nextOfferId,
  nextConsentId,
};
