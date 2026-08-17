const CreditAccount = require("../../models/CreditAccount");
const creditCache = require("./creditCache.service");

class CreditBalanceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Validates the core balance invariant:
 * availableCredit + utilizedCredit + reservedCredit <= creditLimit
 * availableCredit >= 0
 *
 * @param {Object} account - CreditAccount document or plain object
 * @returns {boolean}
 */
function verifyBalanceInvariant(account) {
  const { creditLimit, availableCredit, utilizedCredit, reservedCredit } = account;
  const sum = (availableCredit || 0) + (utilizedCredit || 0) + (reservedCredit || 0);
  const isValid = Math.abs(sum - creditLimit) <= 0.01 && availableCredit >= 0 && utilizedCredit >= 0 && reservedCredit >= 0;
  return isValid;
}

/**
 * Derives and returns authoritative balance structure from account data
 *
 * @param {Object} account
 * @returns {Object}
 */
function deriveBalance(account) {
  const creditLimit = Number(account.creditLimit) || 0;
  const utilizedCredit = Number(account.utilizedCredit) || 0;
  const reservedCredit = Number(account.reservedCredit) || 0;
  const availableCredit = Math.max(0, creditLimit - utilizedCredit - reservedCredit);
  const utilizationPercentage = creditLimit > 0 ? Math.min(100, Math.round((utilizedCredit / creditLimit) * 100)) : 0;
  const reservedPercentage = creditLimit > 0 ? Math.min(100, Math.round((reservedCredit / creditLimit) * 100)) : 0;

  return {
    creditAccountId: account.id,
    userId: account.userId,
    lenderId: account.lenderId,
    creditLimit,
    availableCredit,
    utilizedCredit,
    reservedCredit,
    utilizationPercentage,
    reservedPercentage,
    currency: account.currency || "INR",
    status: account.status,
    lastActivityAt: account.lastActivityAt,
  };
}

/**
 * Checks if account has sufficient available credit for requested amount
 *
 * @param {string} accountId
 * @param {number} requestedAmount
 * @returns {Promise<{ hasCredit: boolean, balance: Object }>}
 */
async function checkAvailableCredit(accountId, requestedAmount) {
  if (typeof requestedAmount !== "number" || requestedAmount <= 0) {
    throw new CreditBalanceError("INVALID_AMOUNT", "Requested amount must be a positive number", 400);
  }

  // Check cache first
  let cached = creditCache.getBalance(accountId);
  let account;

  if (cached) {
    account = cached;
  } else {
    account = await CreditAccount.findOne({ id: accountId });
    if (!account) {
      throw new CreditBalanceError("ACCOUNT_NOT_FOUND", `Credit account '${accountId}' not found`, 404);
    }
    const balance = deriveBalance(account);
    creditCache.setBalance(accountId, balance);
  }

  if (account.status !== "ACTIVE") {
    throw new CreditBalanceError("ACCOUNT_INACTIVE", `Credit account is in status '${account.status}'`, 403);
  }

  const hasCredit = account.availableCredit >= requestedAmount;
  return {
    hasCredit,
    requestedAmount,
    availableCredit: account.availableCredit,
    balance: deriveBalance(account),
  };
}

module.exports = {
  CreditBalanceError,
  verifyBalanceInvariant,
  deriveBalance,
  checkAvailableCredit,
};
