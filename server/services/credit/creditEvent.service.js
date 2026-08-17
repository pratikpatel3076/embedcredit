const CreditConsumptionEvent = require("../../models/CreditConsumptionEvent");
const { nextCreditEventId } = require("../../utils/idGenerator");
const eventBus = require("./eventBus.service");

class CreditEventError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Check if an event with the given idempotency key already exists.
 *
 * @param {string} idempotencyKey
 * @returns {Promise<Object|null>} Existing event or null
 */
async function findByIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey || typeof idempotencyKey !== "string") return null;
  return CreditConsumptionEvent.findOne({ idempotencyKey });
}

/**
 * Record an immutable consumption credit event into the ledger.
 *
 * @param {Object} eventData
 * @returns {Promise<Object>} Created event document
 */
async function recordEvent(eventData) {
  const {
    idempotencyKey,
    creditAccountId,
    userId,
    applicationId = null,
    loanId = null,
    eventType,
    units = 1,
    creditAmount,
    balanceAfter = {},
    source = "CONSUMER_PORTAL",
    metadata = {},
    status = "SUCCESS",
  } = eventData;

  if (!creditAccountId || !userId || !eventType || typeof creditAmount !== "number") {
    throw new CreditEventError("INVALID_EVENT_DATA", "Missing required event fields (creditAccountId, userId, eventType, creditAmount)", 400);
  }

  // Generate unique event ID
  const eventId = await nextCreditEventId();

  const eventDoc = await CreditConsumptionEvent.create({
    id: eventId,
    eventId,
    idempotencyKey: idempotencyKey || null,
    creditAccountId,
    userId,
    applicationId,
    loanId,
    eventType,
    units,
    creditAmount,
    balanceAfter,
    source,
    metadata,
    status,
    processedAt: new Date(),
  });

  // Publish to asynchronous event bus for analytics & notification dispatch
  eventBus.publish(eventDoc.toObject());

  return eventDoc;
}

/**
 * Query immutable events with pagination and filtering
 *
 * @param {Object} filters
 * @returns {Promise<{ events: Array, total: number, page: number, limit: number }>}
 */
async function queryEvents(filters = {}) {
  const {
    creditAccountId,
    userId,
    eventType,
    source,
    status,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  } = filters;

  const query = {};
  if (creditAccountId) query.creditAccountId = creditAccountId;
  if (userId) query.userId = userId;
  if (eventType) query.eventType = eventType;
  if (source) query.source = source;
  if (status) query.status = status;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [events, total] = await Promise.all([
    CreditConsumptionEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    CreditConsumptionEvent.countDocuments(query),
  ]);

  return {
    events,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
}

/**
 * Get single event by ID
 * @param {string} eventId
 */
async function getEventById(eventId) {
  return CreditConsumptionEvent.findOne({ $or: [{ id: eventId }, { eventId }] });
}

module.exports = {
  CreditEventError,
  findByIdempotencyKey,
  recordEvent,
  queryEvents,
  getEventById,
};
