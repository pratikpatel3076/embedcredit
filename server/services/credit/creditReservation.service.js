const CreditAccount = require("../../models/CreditAccount");
const CreditConsumptionEvent = require("../../models/CreditConsumptionEvent");
const { recordEvent, findByIdempotencyKey } = require("./creditEvent.service");
const { evaluateTransactionRules } = require("./creditRules.service");
const { deriveBalance } = require("./creditBalance.service");
const creditCache = require("./creditCache.service");

class CreditReservationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Temporarily reserve credit capacity for an asynchronous transaction or checkout.
 *
 * State transition:
 * availableCredit -= amount
 * reservedCredit += amount
 *
 * @param {Object} params
 * @param {string} params.accountId
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.idempotencyKey
 * @param {string} [params.purpose]
 * @param {string} [params.source]
 * @param {Object} [params.metadata]
 * @returns {Promise<{ success: boolean, reservation: Object, balance: Object }>}
 */
async function reserveCredit(params) {
  const {
    accountId,
    userId,
    amount,
    idempotencyKey,
    purpose = "shopping",
    source = "CONSUMER_PORTAL",
    metadata = {},
  } = params;

  // 1. Validate input
  if (!accountId || !userId || typeof amount !== "number" || amount <= 0) {
    throw new CreditReservationError("INVALID_RESERVATION_PARAMS", "accountId, userId, and positive amount are required", 400);
  }
  if (!idempotencyKey) {
    throw new CreditReservationError("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required for credit reservations", 400);
  }

  // 2. Strict Idempotency check: Return existing event if already processed
  const existingEvent = await findByIdempotencyKey(idempotencyKey);
  if (existingEvent) {
    const account = await CreditAccount.findOne({ id: accountId });
    return {
      success: true,
      isDuplicate: true,
      reservation: existingEvent,
      balance: account ? deriveBalance(account) : existingEvent.balanceAfter,
    };
  }

  // 3. Load account & evaluate pre-flight rules
  const account = await CreditAccount.findOne({ id: accountId });
  if (!account) {
    throw new CreditReservationError("ACCOUNT_NOT_FOUND", `Credit account '${accountId}' not found`, 404);
  }
  if (account.userId !== userId) {
    throw new CreditReservationError("UNAUTHORIZED_ACCOUNT_ACCESS", "User not authorized for this credit account", 403);
  }

  const { allowed, violations } = await evaluateTransactionRules({
    account,
    amount,
    purpose,
  });

  if (!allowed) {
    throw new CreditReservationError(
      violations.some((v) => v.includes("Insufficient")) ? "INSUFFICIENT_CREDIT" : "RULE_VIOLATION",
      violations.join(" "),
      violations.some((v) => v.includes("Insufficient")) ? 402 : 400
    );
  }

  // 4. Atomic conditional update (Prevents race conditions & negative balances)
  const updatedAccount = await CreditAccount.findOneAndUpdate(
    {
      id: accountId,
      userId,
      status: "ACTIVE",
      availableCredit: { $gte: amount },
    },
    {
      $inc: {
        availableCredit: -amount,
        reservedCredit: amount,
        version: 1,
      },
      $set: {
        lastActivityAt: new Date(),
      },
    },
    { new: true }
  );

  if (!updatedAccount) {
    // Condition failed: account status changed or insufficient credit due to concurrent transaction
    const latest = await CreditAccount.findOne({ id: accountId });
    if (!latest || latest.availableCredit < amount) {
      throw new CreditReservationError("INSUFFICIENT_CREDIT", "Insufficient available credit for this reservation.", 402);
    }
    throw new CreditReservationError("CONCURRENT_UPDATE_CONFLICT", "Account was modified concurrently. Please retry.", 409);
  }

  // 5. Append immutable event to ledger
  const event = await recordEvent({
    idempotencyKey,
    creditAccountId: accountId,
    userId,
    eventType: "CREDIT_RESERVED",
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
      ...metadata,
    },
    status: "SUCCESS",
  });

  // 6. Update cache
  creditCache.setBalance(accountId, deriveBalance(updatedAccount));

  return {
    success: true,
    reservation: event,
    balance: deriveBalance(updatedAccount),
  };
}

/**
 * Release a previously reserved credit capacity (e.g. on cart cancellation or operation failure).
 *
 * State transition:
 * reservedCredit -= amount
 * availableCredit += amount
 *
 * @param {Object} params
 * @param {string} params.reservationEventId - ID of CREDIT_RESERVED event
 * @param {string} params.accountId
 * @param {string} params.userId
 * @param {string} params.idempotencyKey
 * @param {string} [params.reason]
 * @returns {Promise<{ success: boolean, releaseEvent: Object, balance: Object }>}
 */
async function releaseCredit(params) {
  const { reservationEventId, accountId, userId, idempotencyKey, reason = "Operation cancelled" } = params;

  if (!reservationEventId || !accountId || !userId) {
    throw new CreditReservationError("INVALID_RELEASE_PARAMS", "reservationEventId, accountId, and userId are required", 400);
  }
  if (!idempotencyKey) {
    throw new CreditReservationError("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required for credit release", 400);
  }

  // Idempotency check
  const existingEvent = await findByIdempotencyKey(idempotencyKey);
  if (existingEvent) {
    const account = await CreditAccount.findOne({ id: accountId });
    return {
      success: true,
      isDuplicate: true,
      releaseEvent: existingEvent,
      balance: account ? deriveBalance(account) : existingEvent.balanceAfter,
    };
  }

  // Find original reservation event
  const reservationEvent = await CreditConsumptionEvent.findOne({
    $or: [{ id: reservationEventId }, { eventId: reservationEventId }],
    creditAccountId: accountId,
    eventType: "CREDIT_RESERVED",
  });

  if (!reservationEvent) {
    throw new CreditReservationError("RESERVATION_NOT_FOUND", `Reservation event '${reservationEventId}' not found for this account`, 404);
  }

  if (reservationEvent.status === "REVERSED") {
    throw new CreditReservationError("ALREADY_RELEASED", "This reservation has already been released or consumed.", 409);
  }

  const amount = reservationEvent.creditAmount;

  // Atomic conditional update
  const updatedAccount = await CreditAccount.findOneAndUpdate(
    {
      id: accountId,
      reservedCredit: { $gte: amount },
    },
    {
      $inc: {
        reservedCredit: -amount,
        availableCredit: amount,
        version: 1,
      },
      $set: {
        lastActivityAt: new Date(),
      },
    },
    { new: true }
  );

  if (!updatedAccount) {
    throw new CreditReservationError("RESERVATION_RELEASE_FAILED", "Failed to release reservation: reserved credit amount mismatch.", 409);
  }

  // Mark reservation event as REVERSED
  reservationEvent.status = "REVERSED";
  await reservationEvent.save();

  // Record immutable CREDIT_RELEASED event
  const releaseEvent = await recordEvent({
    idempotencyKey,
    creditAccountId: accountId,
    userId,
    eventType: "CREDIT_RELEASED",
    creditAmount: amount,
    balanceAfter: {
      creditLimit: updatedAccount.creditLimit,
      availableCredit: updatedAccount.availableCredit,
      utilizedCredit: updatedAccount.utilizedCredit,
      reservedCredit: updatedAccount.reservedCredit,
    },
    source: "SYSTEM",
    metadata: {
      originalReservationId: reservationEvent.id,
      reason,
    },
    status: "SUCCESS",
  });

  creditCache.setBalance(accountId, deriveBalance(updatedAccount));

  return {
    success: true,
    releaseEvent,
    balance: deriveBalance(updatedAccount),
  };
}

module.exports = {
  CreditReservationError,
  reserveCredit,
  releaseCredit,
};
