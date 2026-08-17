const CreditRule = require("../../models/CreditRule");

class CreditRuleError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Permitted default purpose categories
const DEFAULT_PERMITTED_PURPOSES = [
  "shopping",
  "electronics",
  "travel",
  "healthcare",
  "education",
  "home_improvement",
  "personal",
  "consumer",
  "emergency",
  "other",
];

/**
 * Evaluate pre-flight rules before credit reservation or direct consumption.
 *
 * @param {Object} params
 * @param {Object} params.account - CreditAccount document or balance object
 * @param {number} params.amount - Transaction amount
 * @param {string} params.purpose - Consumption category / purpose
 * @param {Object} [params.user] - Requesting user info
 * @returns {Promise<{ allowed: boolean, violations: Array<string> }>}
 */
async function evaluateTransactionRules({ account, amount, purpose, user }) {
  const violations = [];

  // 1. Account status validation
  if (!account) {
    violations.push("Credit account does not exist.");
  } else if (account.status === "SUSPENDED") {
    violations.push("Credit facility is currently SUSPENDED due to compliance or risk review.");
  } else if (account.status === "BLOCKED") {
    violations.push("Credit facility is BLOCKED.");
  } else if (account.status === "EXPIRED") {
    violations.push("Credit facility has EXPIRED.");
  } else if (account.status !== "ACTIVE") {
    violations.push(`Credit facility is not ACTIVE (Status: ${account.status}).`);
  }

  // 2. Amount validity
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
    violations.push("Transaction amount must be a positive number.");
  }

  // 3. Available credit check
  if (account && typeof amount === "number" && amount > account.availableCredit) {
    violations.push(
      `Insufficient available credit (Requested: ₹${amount.toLocaleString("en-IN")}, Available: ₹${(account.availableCredit || 0).toLocaleString("en-IN")}).`
    );
  }

  // 4. Purpose category validation
  if (purpose) {
    const normPurpose = String(purpose).toLowerCase().trim().replace(/\s+/g, "_");
    if (!DEFAULT_PERMITTED_PURPOSES.includes(normPurpose)) {
      violations.push(`Consumption category '${purpose}' is not in the list of authorized categories.`);
    }
  }

  // 5. Evaluate dynamic CreditRule documents in DB if present
  try {
    const rules = await CreditRule.find({
      active: true,
      $or: [{ lenderProductId: null }, { lenderProductId: account?.lenderProductId || "" }],
    });

    for (const rule of rules) {
      if (rule.ruleType === "MAX_SINGLE_TRANSACTION") {
        const maxLimit = rule.threshold?.maxAmount;
        if (typeof maxLimit === "number" && amount > maxLimit) {
          violations.push(
            `Transaction amount exceeds the maximum single-transaction rule limit of ₹${maxLimit.toLocaleString("en-IN")}.`
          );
        }
      } else if (rule.ruleType === "MIN_AVAILABLE_CREDIT") {
        const minRem = rule.threshold?.minAmount || 0;
        if (account && account.availableCredit - amount < minRem) {
          violations.push(
            `Transaction would breach minimum required residual credit threshold of ₹${minRem.toLocaleString("en-IN")}.`
          );
        }
      }
    }
  } catch (err) {
    console.error("[CreditRules] Error fetching dynamic rules:", err.message);
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

module.exports = {
  CreditRuleError,
  evaluateTransactionRules,
  DEFAULT_PERMITTED_PURPOSES,
};
