const CreditAccount = require("../../models/CreditAccount");
const CreditConsumptionEvent = require("../../models/CreditConsumptionEvent");
const { recordEvent, findByIdempotencyKey } = require("./creditEvent.service");
const { evaluateTransactionRules } = require("./creditRules.service");
const { deriveBalance } = require("./creditBalance.service");
const creditCache = require("./creditCache.service");

class CreditConsumptionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Execute atomic credit consumption (Direct or from a previous Reservation).
 *
 * Direct Consumption State transition:
 * availableCredit -= amount
 * utilizedCredit += amount
 *
 * Reservation-Fulfilled State transition:
 * reservedCredit -= amount
 * utilizedCredit += amount
 *
 * @param {Object} params
 * @param {string} params.accountId
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} [params.reservationEventId] - Optional reservation ID
 * @param {string} params.idempotencyKey
 * @param {string} [params.purpose]
 * @param {string} [params.source]
 * @param {Object} [params.metadata]
 * @returns {Promise<{ success: boolean, event: Object, balance: Object }>}
 */
async function consumeCredit(params) {
  const {
    accountId,
    userId,
    amount,
    reservationEventId = null,
    idempotencyKey,
    purpose = "shopping",
    source = "CONSUMER_PORTAL",
    metadata = {},
  } = params;

  // 1. Validate inputs
  if (!accountId || !userId || typeof amount !== "number" || amount <= 0) {
    throw new CreditConsumptionError("INVALID_CONSUMPTION_PARAMS", "accountId, userId, and a positive amount are required", 400);
  }
  if (!idempotencyKey) {
    throw new CreditConsumptionError("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required for credit consumption", 400);
  }

  // 2. Strict Idempotency check: Return existing event if already processed
  const existingEvent = await findByIdempotencyKey(idempotencyKey);
  if (existingEvent) {
    const account = await CreditAccount.findOne({ id: accountId });
    return {
      success: true,
      isDuplicate: true,
      event: existingEvent,
      balance: account ? deriveBalance(account) : existingEvent.balanceAfter,
    };
  }

  // 3. Load account
  const account = await CreditAccount.findOne({ id: accountId });
  if (!account) {
    throw new CreditConsumptionError("ACCOUNT_NOT_FOUND", `Credit account '${accountId}' not found`, 404);
  }
  if (account.userId !== userId) {
    throw new CreditConsumptionError("UNAUTHORIZED_ACCOUNT_ACCESS", "User not authorized for this credit account", 403);
  }

  let updatedAccount;
  let reservationDoc = null;

  if (reservationEventId) {
    // 4A. Consumption against a previous reservation
    reservationDoc = await CreditConsumptionEvent.findOne({
      $or: [{ id: reservationEventId }, { eventId: reservationEventId }],
      creditAccountId: accountId,
      eventType: "CREDIT_RESERVED",
    });

    if (!reservationDoc) {
      throw new CreditConsumptionError("RESERVATION_NOT_FOUND", `Reservation '${reservationEventId}' not found`, 404);
    }
    if (reservationDoc.status === "REVERSED") {
      throw new CreditConsumptionError("RESERVATION_ALREADY_USED", "This reservation has already been settled or released.", 409);
    }

    const reservedAmt = reservationDoc.creditAmount;
    if (amount > reservedAmt) {
      throw new CreditConsumptionError(
        "AMOUNT_EXCEEDS_RESERVATION",
        `Requested consumption (₹${amount}) exceeds reserved amount (₹${reservedAmt})`,
        400
      );
    }

    // Atomic update: transfer from reservedCredit to utilizedCredit (and return any unused diff to availableCredit)
    const unusedDiff = reservedAmt - amount;

    updatedAccount = await CreditAccount.findOneAndUpdate(
      {
        id: accountId,
        reservedCredit: { $gte: reservedAmt },
      },
      {
        $inc: {
          reservedCredit: -reservedAmt,
          utilizedCredit: amount,
          availableCredit: unusedDiff,
          version: 1,
        },
        $set: { lastActivityAt: new Date() },
      },
      { new: true }
    );

    if (!updatedAccount) {
      throw new CreditConsumptionError("SETTLEMENT_FAILED", "Failed to settle reservation: reserved balance conflict.", 409);
    }

    // Mark reservation event as REVERSED / FULFILLED
    reservationDoc.status = "REVERSED";
    await reservationDoc.save();
  } else {
    // 4B. Direct consumption without prior reservation
    const { allowed, violations } = await evaluateTransactionRules({
      account,
      amount,
      purpose,
    });

    if (!allowed) {
      throw new CreditConsumptionError(
        violations.some((v) => v.includes("Insufficient")) ? "INSUFFICIENT_CREDIT" : "RULE_VIOLATION",
        violations.join(" "),
        violations.some((v) => v.includes("Insufficient")) ? 402 : 400
      );
    }

    // Atomic conditional update: prevents race condition / negative balances
    updatedAccount = await CreditAccount.findOneAndUpdate(
      {
        id: accountId,
        userId,
        status: "ACTIVE",
        availableCredit: { $gte: amount },
      },
      {
        $inc: {
          availableCredit: -amount,
          utilizedCredit: amount,
          version: 1,
        },
        $set: { lastActivityAt: new Date() },
      },
      { new: true }
    );

    if (!updatedAccount) {
      const latest = await CreditAccount.findOne({ id: accountId });
      if (!latest || latest.availableCredit < amount) {
        throw new CreditConsumptionError("INSUFFICIENT_CREDIT", "Insufficient available credit for this operation.", 402);
      }
      throw new CreditConsumptionError("CONCURRENT_UPDATE_CONFLICT", "Account was modified concurrently. Please retry.", 409);
    }
  }

  // 5. Append immutable CREDIT_CONSUMED event
  const event = await recordEvent({
    idempotencyKey,
    creditAccountId: accountId,
    userId,
    eventType: "CREDIT_CONSUMED",
    creditAmount: amount,
    balanceAfter: {
      creditLimit: updatedAccount.creditLimit,
      availableCredit: updatedAccount.availableCredit,
      utilizedCredit: updatedAccount.utilizedCredit,
      reservedCredit: updatedAccount.reservedCredit,
    },
    source,
    metadata: {
      purpose,
      reservationEventId: reservationDoc?.id || null,
      ...metadata,
    },
    status: "SUCCESS",
  });

  // 6. Invalidate and update balance cache
  creditCache.setBalance(accountId, deriveBalance(updatedAccount));

  return {
    success: true,
    event,
    balance: deriveBalance(updatedAccount),
  };
}

/**
 * Record an authorized repayment against utilized credit.
 *
 * State transition:
 * utilizedCredit -= amount
 * availableCredit += amount
 *
 * @param {Object} params
 * @param {string} params.accountId
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.idempotencyKey
 * @param {string} [params.source]
 * @param {string} [params.paymentReference]
 * @param {Object} [params.metadata]
 * @returns {Promise<{ success: boolean, event: Object, balance: Object }>}
 */
async function recordRepayment(params) {
  const {
    accountId,
    userId,
    amount,
    idempotencyKey,
    source = "SYSTEM",
    paymentReference = null,
    metadata = {},
  } = params;

  if (!accountId || !userId || typeof amount !== "number" || amount <= 0) {
    throw new CreditConsumptionError("INVALID_REPAYMENT_PARAMS", "accountId, userId, and a positive amount are required", 400);
  }
  if (!idempotencyKey) {
    throw new CreditConsumptionError("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required for repayment records", 400);
  }

  // Idempotency check
  const existingEvent = await findByIdempotencyKey(idempotencyKey);
  if (existingEvent) {
    const account = await CreditAccount.findOne({ id: accountId });
    return {
      success: true,
      isDuplicate: true,
      event: existingEvent,
      balance: account ? deriveBalance(account) : existingEvent.balanceAfter,
    };
  }

  const account = await CreditAccount.findOne({ id: accountId });
  if (!account) {
    throw new CreditConsumptionError("ACCOUNT_NOT_FOUND", `Credit account '${accountId}' not found`, 404);
  }

  // Cap repayment amount to actual utilizedCredit if user pays excess
  const repayAmount = Math.min(amount, account.utilizedCredit);
  if (repayAmount <= 0) {
    throw new CreditConsumptionError("NO_OUTSTANDING_UTILIZATION", "Credit account has zero utilized credit to repay.", 400);
  }

  // Atomic conditional update
  const updatedAccount = await CreditAccount.findOneAndUpdate(
    {
      id: accountId,
      utilizedCredit: { $gte: repayAmount },
    },
    {
      $inc: {
        utilizedCredit: -repayAmount,
        availableCredit: repayAmount,
        version: 1,
      },
      $set: { lastActivityAt: new Date() },
    },
    { new: true }
  );

  if (!updatedAccount) {
    throw new CreditConsumptionError("REPAYMENT_FAILED", "Concurrent update prevented repayment processing. Please retry.", 409);
  }

  // Append immutable CREDIT_REPAID event
  const event = await recordEvent({
    idempotencyKey,
    creditAccountId: accountId,
    userId,
    eventType: "CREDIT_REPAID",
    creditAmount: repayAmount,
    balanceAfter: {
      creditLimit: updatedAccount.creditLimit,
      availableCredit: updatedAccount.availableCredit,
      utilizedCredit: updatedAccount.utilizedCredit,
      reservedCredit: updatedAccount.reservedCredit,
    },
    source,
    metadata: {
      paymentReference,
      originalRequestedAmount: amount,
      ...metadata,
    },
    status: "SUCCESS",
  });

  creditCache.setBalance(accountId, deriveBalance(updatedAccount));

  return {
    success: true,
    event,
    balance: deriveBalance(updatedAccount),
  };
}

/**
 * Reverse a previous consumption event (e.g. failed downstream merchant fulfillment, refund).
 *
 * State transition:
 * utilizedCredit -= amount
 * availableCredit += amount
 *
 * @param {Object} params
 * @param {string} params.originalEventId
 * @param {string} params.accountId
 * @param {string} params.userId
 * @param {string} params.idempotencyKey
 * @param {string} [params.reason]
 * @param {string} [params.actor]
 * @returns {Promise<{ success: boolean, reversalEvent: Object, balance: Object }>}
 */
async function reverseConsumption(params) {
  const {
    originalEventId,
    accountId,
    userId,
    idempotencyKey,
    reason = "Transaction cancelled / refunded",
    actor = "SYSTEM",
  } = params;

  if (!originalEventId || !accountId || !userId) {
    throw new CreditConsumptionError("INVALID_REVERSAL_PARAMS", "originalEventId, accountId, and userId are required", 400);
  }
  if (!idempotencyKey) {
    throw new CreditConsumptionError("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required for credit reversal", 400);
  }

  // Idempotency check
  const existingEvent = await findByIdempotencyKey(idempotencyKey);
  if (existingEvent) {
    const account = await CreditAccount.findOne({ id: accountId });
    return {
      success: true,
      isDuplicate: true,
      reversalEvent: existingEvent,
      balance: account ? deriveBalance(account) : existingEvent.balanceAfter,
    };
  }

  // Load original consumption event
  const originalEvent = await CreditConsumptionEvent.findOne({
    $or: [{ id: originalEventId }, { eventId: originalEventId }],
    creditAccountId: accountId,
    eventType: "CREDIT_CONSUMED",
  });

  if (!originalEvent) {
    throw new CreditConsumptionError("ORIGINAL_EVENT_NOT_FOUND", `Original consumption event '${originalEventId}' not found`, 404);
  }

  if (originalEvent.status === "REVERSED") {
    throw new CreditConsumptionError("ALREADY_REVERSED", "This transaction has already been reversed.", 409);
  }

  const amount = originalEvent.creditAmount;

  // Atomic conditional update
  const updatedAccount = await CreditAccount.findOneAndUpdate(
    {
      id: accountId,
      utilizedCredit: { $gte: amount },
    },
    {
      $inc: {
        utilizedCredit: -amount,
        availableCredit: amount,
        version: 1,
      },
      $set: { lastActivityAt: new Date() },
    },
    { new: true }
  );

  if (!updatedAccount) {
    throw new CreditConsumptionError("REVERSAL_FAILED", "Failed to reverse consumption: utilized credit mismatch.", 409);
  }

  // Mark original event as REVERSED
  originalEvent.status = "REVERSED";
  await originalEvent.save();

  // Record immutable CREDIT_REVERSED event
  const reversalEvent = await recordEvent({
    idempotencyKey,
    creditAccountId: accountId,
    userId,
    eventType: "CREDIT_REVERSED",
    creditAmount: amount,
    balanceAfter: {
      creditLimit: updatedAccount.creditLimit,
      availableCredit: updatedAccount.availableCredit,
      utilizedCredit: updatedAccount.utilizedCredit,
      reservedCredit: updatedAccount.reservedCredit,
    },
    source: "SYSTEM",
    metadata: {
      originalEventId: originalEvent.id,
      reason,
      reversedBy: actor,
    },
    status: "SUCCESS",
  });

  creditCache.setBalance(accountId, deriveBalance(updatedAccount));

  return {
    success: true,
    reversalEvent,
    balance: deriveBalance(updatedAccount),
  };
}

module.exports = {
  CreditConsumptionError,
  consumeCredit,
  recordRepayment,
  reverseConsumption,
};
