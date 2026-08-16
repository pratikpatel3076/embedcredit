// Generates the next business key (e.g. APP-004, L005) by scanning
// existing `id` values for the given model and prefix.
const LoanApplication = require("../models/LoanApplication");
const LenderProduct = require("../models/LenderProduct");

async function nextId(model, prefix) {
  const docs = await model.find({}).select("id");
  let max = 0;
  for (const d of docs) {
    const rest = String(d.id || "").slice(prefix.length);
    const m = /^(\d+)$/.exec(rest);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + String(max + 1).padStart(3, "0");
}

const nextApplicationId = () => nextId(LoanApplication, "APP-");
const nextLenderId = () => nextId(LenderProduct, "L");

module.exports = { nextApplicationId, nextLenderId };
