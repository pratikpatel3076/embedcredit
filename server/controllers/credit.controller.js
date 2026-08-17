const CreditService = require("../services/credit");
const CreditAccount = require("../models/CreditAccount");
const CreditConsumptionEvent = require("../models/CreditConsumptionEvent");
const CreditRule = require("../models/CreditRule");
const LenderProduct = require("../models/LenderProduct");

// 1. GET /api/credit/account
async function getAccount(req, res) {
  const role = req.user.role;
  const userIdentifier = req.user.userId || req.user.sub;

  if (role === "USER") {
    const account = await CreditService.getOrCreateUserPrimaryAccount(userIdentifier, {
      creditLimit: 100000,
    });
    const balance = CreditService.deriveBalance(account);
    return res.json({ account, balance });
  }

  if (role === "LENDER") {
    const lenderId = req.user.lenderId;
    const { page, limit, status } = req.query;
    const result = await CreditService.getLenderCreditAccounts(lenderId, { page, limit, status });
    return res.json(result);
  }

  if (role === "ADMIN") {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [accounts, total] = await Promise.all([
      CreditAccount.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      CreditAccount.countDocuments(),
    ]);

    return res.json({
      accounts: accounts.map((a) => ({
        ...a.toObject(),
        balance: CreditService.deriveBalance(a),
      })),
      total,
      page,
      limit,
    });
  }

  // DLA role
  const accounts = await CreditAccount.find().limit(20);
  return res.json({ accounts });
}

// 2. GET /api/credit/account/:id
async function getAccountById(req, res) {
  const account = req.creditAccount;
  const balance = CreditService.deriveBalance(account);
  return res.json({ account, balance });
}

// 3. GET /api/credit/balance
async function getBalance(req, res) {
  const userIdentifier = req.user.userId || req.user.sub;
  const accountId = req.query.accountId;

  let account;
  if (accountId) {
    account = await CreditService.getCreditAccount(accountId);
  } else {
    account = await CreditService.getOrCreateUserPrimaryAccount(userIdentifier);
  }

  const balance = CreditService.deriveBalance(account);
  return res.json(balance);
}

// 4. GET /api/credit/events
async function getEvents(req, res) {
  const role = req.user.role;
  const userIdentifier = req.user.userId || req.user.sub;
  const { accountId, eventType, startDate, endDate, page, limit } = req.query;

  const filters = {
    eventType,
    startDate,
    endDate,
    page,
    limit,
  };

  if (role === "USER") {
    filters.userId = userIdentifier;
  } else if (role === "LENDER") {
    if (accountId) {
      filters.creditAccountId = accountId;
    } else {
      // Find accounts belonging to this lender
      const accounts = await CreditAccount.find({ lenderId: req.user.lenderId }).select("id");
      const accountIds = accounts.map((a) => a.id);
      // Query events for these accounts
      const query = { creditAccountId: { $in: accountIds } };
      if (eventType) query.eventType = eventType;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const [events, total] = await Promise.all([
        CreditConsumptionEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
        CreditConsumptionEvent.countDocuments(query),
      ]);

      return res.json({ events, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
    }
  } else if (accountId) {
    filters.creditAccountId = accountId;
  }

  const result = await CreditService.queryEvents(filters);
  return res.json(result);
}

// 5. POST /api/credit/check
async function checkCredit(req, res) {
  const { accountId, amount, purpose } = req.body || {};
  const userIdentifier = req.user.userId || req.user.sub;

  let account;
  if (accountId) {
    account = await CreditAccount.findOne({ id: accountId });
  } else {
    account = await CreditService.getOrCreateUserPrimaryAccount(userIdentifier);
  }

  if (!account) {
    return res.status(404).json({
      success: false,
      error: { code: "ACCOUNT_NOT_FOUND", message: "Credit account not found" },
    });
  }

  const checkAmt = Number(amount) || 0;
  const { allowed, violations } = await CreditService.evaluateTransactionRules({
    account,
    amount: checkAmt,
    purpose: purpose || "shopping",
  });

  const balance = CreditService.deriveBalance(account);

  return res.json({
    eligible: allowed,
    requestedAmount: checkAmt,
    availableCredit: balance.availableCredit,
    violations,
    balance,
  });
}

// 6. POST /api/credit/reserve
async function reserve(req, res) {
  const { accountId, amount, idempotencyKey, purpose, source, metadata } = req.body || {};
  const userIdentifier = req.user.userId || req.user.sub;

  const headerKey = req.headers["idempotency-key"] || idempotencyKey;
  if (!headerKey) {
    return res.status(400).json({
      success: false,
      error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency key header or field is required." },
    });
  }

  let targetAccountId = accountId;
  if (!targetAccountId) {
    const acc = await CreditService.getOrCreateUserPrimaryAccount(userIdentifier);
    targetAccountId = acc.id;
  }

  try {
    const result = await CreditService.reserveCredit({
      accountId: targetAccountId,
      userId: userIdentifier,
      amount: Number(amount),
      idempotencyKey: headerKey,
      purpose,
      source: source || (req.user.role === "DLA" ? "DLA" : "CONSUMER_PORTAL"),
      metadata,
    });

    return res.status(result.isDuplicate ? 200 : 201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || "RESERVATION_FAILED", message: err.message },
    });
  }
}

// 7. POST /api/credit/consume
async function consume(req, res) {
  const { accountId, amount, reservationEventId, idempotencyKey, purpose, source, metadata } = req.body || {};
  const userIdentifier = req.user.userId || req.user.sub;

  const headerKey = req.headers["idempotency-key"] || idempotencyKey;
  if (!headerKey) {
    return res.status(400).json({
      success: false,
      error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency key header or field is required." },
    });
  }

  let targetAccountId = accountId;
  if (!targetAccountId) {
    const acc = await CreditService.getOrCreateUserPrimaryAccount(userIdentifier);
    targetAccountId = acc.id;
  }

  try {
    const result = await CreditService.consumeCredit({
      accountId: targetAccountId,
      userId: userIdentifier,
      amount: Number(amount),
      reservationEventId,
      idempotencyKey: headerKey,
      purpose,
      source: source || (req.user.role === "DLA" ? "DLA" : "CONSUMER_PORTAL"),
      metadata,
    });

    return res.status(result.isDuplicate ? 200 : 201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || "CONSUMPTION_FAILED", message: err.message },
    });
  }
}

// 8. POST /api/credit/release
async function release(req, res) {
  const { reservationEventId, accountId, idempotencyKey, reason } = req.body || {};
  const userIdentifier = req.user.userId || req.user.sub;

  const headerKey = req.headers["idempotency-key"] || idempotencyKey;
  if (!headerKey) {
    return res.status(400).json({
      success: false,
      error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency key header or field is required." },
    });
  }

  try {
    const result = await CreditService.releaseCredit({
      reservationEventId,
      accountId,
      userId: userIdentifier,
      idempotencyKey: headerKey,
      reason,
    });

    return res.status(result.isDuplicate ? 200 : 200).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || "RELEASE_FAILED", message: err.message },
    });
  }
}

// 9. POST /api/credit/repayment (LENDER / authorized flow)
async function repayment(req, res) {
  const { accountId, userId, amount, idempotencyKey, paymentReference, metadata } = req.body || {};
  const headerKey = req.headers["idempotency-key"] || idempotencyKey;
  if (!headerKey) {
    return res.status(400).json({
      success: false,
      error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency key is required for repayment records." },
    });
  }

  try {
    const result = await CreditService.recordRepayment({
      accountId,
      userId: userId || req.user.userId || req.user.sub,
      amount: Number(amount),
      idempotencyKey: headerKey,
      source: req.user.role === "LENDER" ? "LENDER_SYNC" : "SYSTEM",
      paymentReference,
      metadata,
    });

    return res.status(result.isDuplicate ? 200 : 200).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || "REPAYMENT_FAILED", message: err.message },
    });
  }
}

// 10. POST /api/credit/reversal (LENDER / authorized flow)
async function reversal(req, res) {
  const { originalEventId, accountId, userId, idempotencyKey, reason } = req.body || {};
  const headerKey = req.headers["idempotency-key"] || idempotencyKey;
  if (!headerKey) {
    return res.status(400).json({
      success: false,
      error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency key is required for reversal records." },
    });
  }

  try {
    const result = await CreditService.reverseConsumption({
      originalEventId,
      accountId,
      userId: userId || req.user.userId || req.user.sub,
      idempotencyKey: headerKey,
      reason,
      actor: req.user.username || "SYSTEM",
    });

    return res.status(result.isDuplicate ? 200 : 200).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || "REVERSAL_FAILED", message: err.message },
    });
  }
}

// 11. GET /api/credit/analytics
async function getAnalytics(req, res) {
  const role = req.user.role;

  if (role === "ADMIN") {
    const accounts = await CreditAccount.find();
    const totalFacilities = accounts.length;
    const activeFacilities = accounts.filter((a) => a.status === "ACTIVE").length;
    const totalCreditLimits = accounts.reduce((sum, a) => sum + (a.creditLimit || 0), 0);
    const totalAvailableCredit = accounts.reduce((sum, a) => sum + (a.availableCredit || 0), 0);
    const totalUtilizedCredit = accounts.reduce((sum, a) => sum + (a.utilizedCredit || 0), 0);
    const totalReservedCredit = accounts.reduce((sum, a) => sum + (a.reservedCredit || 0), 0);
    const avgUtilization = totalCreditLimits > 0 ? Math.round((totalUtilizedCredit / totalCreditLimits) * 100) : 0;

    const totalEvents = await CreditConsumptionEvent.countDocuments();
    const consumptionEvents = await CreditConsumptionEvent.countDocuments({ eventType: "CREDIT_CONSUMED" });
    const repaymentEvents = await CreditConsumptionEvent.countDocuments({ eventType: "CREDIT_REPAID" });
    const reservationEvents = await CreditConsumptionEvent.countDocuments({ eventType: "CREDIT_RESERVED" });

    // Aggregates by lender
    const lenders = await LenderProduct.find();
    const lenderBreakdown = lenders.map((l) => {
      const lAccounts = accounts.filter((a) => a.lenderId === l.id);
      const lLimits = lAccounts.reduce((s, a) => s + (a.creditLimit || 0), 0);
      const lUtilized = lAccounts.reduce((s, a) => s + (a.utilizedCredit || 0), 0);
      const lAvailable = lAccounts.reduce((s, a) => s + (a.availableCredit || 0), 0);
      return {
        lenderId: l.id,
        lenderName: l.lenderName,
        facilityCount: lAccounts.length,
        totalLimit: lLimits,
        totalUtilized: lUtilized,
        totalAvailable: lAvailable,
        utilizationPct: lLimits > 0 ? Math.round((lUtilized / lLimits) * 100) : 0,
      };
    });

    return res.json({
      totalFacilities,
      activeFacilities,
      totalCreditLimits,
      totalAvailableCredit,
      totalUtilizedCredit,
      totalReservedCredit,
      avgUtilization,
      eventCounts: {
        total: totalEvents,
        consumed: consumptionEvents,
        repaid: repaymentEvents,
        reserved: reservationEvents,
      },
      lenderBreakdown,
    });
  }

  if (role === "LENDER") {
    const lenderId = req.user.lenderId;
    const accounts = await CreditAccount.find({ lenderId });
    const totalFacilities = accounts.length;
    const totalCreditLimits = accounts.reduce((sum, a) => sum + (a.creditLimit || 0), 0);
    const totalUtilizedCredit = accounts.reduce((sum, a) => sum + (a.utilizedCredit || 0), 0);
    const totalAvailableCredit = accounts.reduce((sum, a) => sum + (a.availableCredit || 0), 0);
    const totalReservedCredit = accounts.reduce((sum, a) => sum + (a.reservedCredit || 0), 0);
    const utilizationPct = totalCreditLimits > 0 ? Math.round((totalUtilizedCredit / totalCreditLimits) * 100) : 0;

    const accountIds = accounts.map((a) => a.id);
    const recentEvents = await CreditConsumptionEvent.find({ creditAccountId: { $in: accountIds } })
      .sort({ createdAt: -1 })
      .limit(10);

    return res.json({
      lenderId,
      totalFacilities,
      totalCreditLimits,
      totalUtilizedCredit,
      totalAvailableCredit,
      totalReservedCredit,
      utilizationPct,
      recentEvents,
    });
  }

  // USER role analytics
  const userIdentifier = req.user.userId || req.user.sub;
  const account = await CreditService.getOrCreateUserPrimaryAccount(userIdentifier);
  const balance = CreditService.deriveBalance(account);
  const recentEvents = await CreditConsumptionEvent.find({ userId: userIdentifier })
    .sort({ createdAt: -1 })
    .limit(10);

  return res.json({
    balance,
    recentEvents,
  });
}

// 12. GET /api/credit/rules
async function getRules(req, res) {
  const rules = await CreditRule.find({ active: true });
  return res.json({
    rules,
    permittedPurposes: CreditService.DEFAULT_PERMITTED_PURPOSES,
  });
}

// 12. POST /api/credit/facilities/:id/drawdown or /api/credit/drawdown
async function drawdown(req, res) {
  const accountId = req.params.id || req.body?.accountId;
  const { amount, tenure, purpose, idempotencyKey, metadata } = req.body || {};
  const userIdentifier = req.user.userId || req.user.sub;

  const headerKey = req.headers["idempotency-key"] || idempotencyKey;
  if (!headerKey) {
    return res.status(400).json({
      success: false,
      error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency key header or field is required for credit drawdowns." },
    });
  }

  let targetAccountId = accountId;
  if (!targetAccountId) {
    const acc = await CreditService.getOrCreateUserPrimaryAccount(userIdentifier);
    targetAccountId = acc.id;
  }

  try {
    const result = await CreditService.createDrawdown({
      accountId: targetAccountId,
      userId: userIdentifier,
      amount: Number(amount),
      tenure: Number(tenure),
      purpose: purpose || "shopping",
      idempotencyKey: headerKey,
      metadata: metadata || {},
    });

    return res.status(result.isDuplicate ? 200 : 201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || "DRAWDOWN_FAILED", message: err.message },
    });
  }
}

module.exports = {
  getAccount,
  getAccountById,
  getBalance,
  getEvents,
  checkCredit,
  reserve,
  consume,
  release,
  repayment,
  reversal,
  getAnalytics,
  getRules,
  drawdown,
};
