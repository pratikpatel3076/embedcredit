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

async function nextCreditAccountId() {
  const CreditAccount = require("../models/CreditAccount");
  const count = await CreditAccount.countDocuments();
  return `CRD-ACC-${String(count + 1).padStart(3, "0")}`;
}

async function nextCreditEventId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CRD-EVT-${timestamp}-${random}`;
}

async function nextCreditRuleId() {
  const CreditRule = require("../models/CreditRule");
  const count = await CreditRule.countDocuments();
  return `RULE-${String(count + 1).padStart(3, "0")}`;
}

async function nextScheduleId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SCH-${timestamp}-${random}`;
}

async function nextRepaymentId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `REP-${timestamp}-${random}`;
}

module.exports = {
  nextApplicationId,
  nextLenderId,
  nextUserId,
  nextIntentId,
  nextOfferId,
  nextConsentId,
  nextCreditAccountId,
  nextCreditEventId,
  nextCreditRuleId,
  nextScheduleId,
  nextRepaymentId,
};
