const CreditAccount = require("../../models/CreditAccount");
const { nextCreditAccountId } = require("../../utils/idGenerator");
const { recordEvent } = require("./creditEvent.service");
const creditCache = require("./creditCache.service");
const { deriveBalance } = require("./creditBalance.service");

class CreditAccountError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Create a new CreditAccount facility for a consumer
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.lenderId
 * @param {string} [params.lenderProductId]
 * @param {string} [params.applicationId]
 * @param {number} params.creditLimit
 * @param {string} [params.source]
 * @param {Object} [params.metadata]
 * @returns {Promise<Object>} Created CreditAccount
 */
async function createCreditAccount(params) {
  const {
    userId,
    lenderId,
    lenderProductId = null,
    applicationId = null,
    creditLimit,
    source = "SYSTEM",
    metadata = {},
  } = params;

  if (!userId || !lenderId || typeof creditLimit !== "number" || creditLimit <= 0) {
    throw new CreditAccountError("INVALID_ACCOUNT_PARAMS", "userId, lenderId, and a positive creditLimit are required", 400);
  }

  // Check if active account already exists for this user and lender product
  const existing = await CreditAccount.findOne({
    userId,
    lenderId,
    status: { $in: ["ACTIVE", "PENDING"] },
  });

  if (existing) {
    return existing;
  }

  const accountId = await nextCreditAccountId();

  const account = await CreditAccount.create({
    id: accountId,
    userId,
    lenderId,
    lenderProductId,
    applicationId,
    creditLimit,
    availableCredit: creditLimit,
    utilizedCredit: 0,
    reservedCredit: 0,
    currency: "INR",
    status: "ACTIVE",
    version: 1,
    openedAt: new Date(),
    lastActivityAt: new Date(),
  });

  // Record initial immutable event: CREDIT_GRANTED
  await recordEvent({
    idempotencyKey: `init-${accountId}-${Date.now()}`,
    creditAccountId: account.id,
    userId,
    applicationId,
    eventType: "CREDIT_GRANTED",
    creditAmount: creditLimit,
    balanceAfter: {
      creditLimit: account.creditLimit,
      availableCredit: account.availableCredit,
      utilizedCredit: 0,
      reservedCredit: 0,
    },
    source,
    metadata: {
      initialLimit: creditLimit,
      ...metadata,
    },
    status: "SUCCESS",
  });

  creditCache.setBalance(account.id, deriveBalance(account));
  return account;
}

/**
 * Get credit account by ID
 * @param {string} accountId
 */
async function getCreditAccount(accountId) {
  const account = await CreditAccount.findOne({ id: accountId });
  if (!account) {
    throw new CreditAccountError("ACCOUNT_NOT_FOUND", `Credit account '${accountId}' not found`, 404);
  }
  return account;
}

/**
 * Get all credit accounts for a user
 * @param {string} userId
 */
async function getUserCreditAccounts(userId) {
  const accounts = await CreditAccount.find({ userId }).sort({ createdAt: -1 });
  return accounts.map((a) => ({
    ...a.toObject(),
    balance: deriveBalance(a),
  }));
}

/**
 * Get primary active credit account for user (or create default demo facility if none exists)
 * @param {string} userId
 * @param {Object} [defaults]
 */
async function getOrCreateUserPrimaryAccount(userId, defaults = {}) {
  let account = await CreditAccount.findOne({ userId, status: "ACTIVE" }).sort({ createdAt: -1 });
  if (!account) {
    account = await createCreditAccount({
      userId,
      lenderId: defaults.lenderId || "L001",
      lenderProductId: defaults.lenderProductId || "L001",
      creditLimit: defaults.creditLimit || 100000,
      source: "SYSTEM",
      metadata: { autoProvisioned: true },
    });
  }
  return account;
}

/**
 * Get all accounts for a lender
 * @param {string} lenderId
 * @param {Object} pagination
 */
async function getLenderCreditAccounts(lenderId, pagination = {}) {
  const { page = 1, limit = 20, status } = pagination;
  const query = { lenderId };
  if (status) query.status = status;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [accounts, total] = await Promise.all([
    CreditAccount.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limitNum),
    CreditAccount.countDocuments(query),
  ]);

  return {
    accounts: accounts.map((a) => ({
      ...a.toObject(),
      balance: deriveBalance(a),
    })),
    total,
    page: pageNum,
    limit: limitNum,
  };
}

/**
 * Update credit account status (e.g. SUSPENDED, BLOCKED, ACTIVE)
 * @param {string} accountId
 * @param {string} newStatus
 * @param {string} reason
 */
async function updateAccountStatus(accountId, newStatus, reason = "") {
  const account = await CreditAccount.findOne({ id: accountId });
  if (!account) {
    throw new CreditAccountError("ACCOUNT_NOT_FOUND", `Credit account '${accountId}' not found`, 404);
  }

  const validStatuses = ["ACTIVE", "SUSPENDED", "BLOCKED", "CLOSED"];
  if (!validStatuses.includes(newStatus)) {
    throw new CreditAccountError("INVALID_STATUS", `Allowed statuses: ${validStatuses.join(", ")}`, 400);
  }

  account.status = newStatus;
  account.lastActivityAt = new Date();
  await account.save();

  creditCache.invalidate(accountId);
  return account;
}

/**
 * Sync / provision credit facility from an approved/disbursed loan
 * @param {Object} loanApp
 * @param {Object} [lenderProduct]
 */
async function syncFacilityFromLoan(loanApp, lenderProduct = null) {
  if (!loanApp || !loanApp.userId) return null;

  try {
    const existing = await CreditAccount.findOne({
      userId: loanApp.userId,
      lenderId: loanApp.routedTo || "L001",
    });

    if (existing) {
      if (existing.status !== "ACTIVE") {
        existing.status = "ACTIVE";
        existing.lastActivityAt = new Date();
        await existing.save();
        creditCache.invalidate(existing.id);
      }
      return existing;
    }

    return await createCreditAccount({
      userId: loanApp.userId,
      lenderId: loanApp.routedTo || "L001",
      lenderProductId: loanApp.routedTo || "L001",
      applicationId: loanApp.id,
      creditLimit: loanApp.amount || 100000,
      source: "LENDER_SYNC",
      metadata: { originatedLoanId: loanApp.id },
    });
  } catch (err) {
    console.error("[CreditAccount] Failed to sync facility from loan:", err.message);
    return null;
  }
}

module.exports = {
  CreditAccountError,
  createCreditAccount,
  getCreditAccount,
  getUserCreditAccounts,
  getOrCreateUserPrimaryAccount,
  getLenderCreditAccounts,
  updateAccountStatus,
  syncFacilityFromLoan,
};
