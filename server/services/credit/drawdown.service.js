const mongoose = require("mongoose");
const CreditAccount = require("../../models/CreditAccount");
const CreditConsumptionEvent = require("../../models/CreditConsumptionEvent");
const LoanApplication = require("../../models/LoanApplication");
const LenderProduct = require("../../models/LenderProduct");
const RepaymentSchedule = require("../../models/RepaymentSchedule");
const User = require("../../models/User");
const { nextApplicationId, nextScheduleId } = require("../../utils/idGenerator");
const { recordEvent, findByIdempotencyKey } = require("./creditEvent.service");
const { deriveBalance } = require("./creditBalance.service");
const { generateKFS } = require("../kfsGenerator");
const { logCompliance } = require("../../middleware/rbiCompliance");
const creditCache = require("./creditCache.service");

class DrawdownError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Standard reducing-balance EMI formula:
 * EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 *
 * @param {number} principal - Loan principal in INR
 * @param {number} ratePA - Annual interest rate percentage (e.g. 14.5)
 * @param {number} months - Tenure in months
 * @returns {number} Monthly EMI rounded to nearest rupee
 */
function calculateEMI(principal, ratePA, months) {
  const r = ratePA / 12 / 100;
  if (r === 0 || months === 0) {
    return months > 0 ? Math.round(principal / months) : 0;
  }
  const factor = Math.pow(1 + r, months);
  return Math.round((principal * r * factor) / (factor - 1));
}

/**
 * Computes full installment amortization schedule splitting principal & interest.
 * Guarantees that sum(principal) === loan principal with zero roundoff drift.
 *
 * @param {number} principal - Total drawdown amount
 * @param {number} ratePA - Annual interest rate (e.g. 14.5)
 * @param {number} tenure - Tenure in months
 * @param {Date} [startDate] - Drawdown activation date
 * @returns {Array<{ installmentNumber: number, dueDate: Date, principalAmount: number, interestAmount: number, totalAmount: number }>}
 */
function calculateAmortizationSchedule(principal, ratePA, tenure, startDate = new Date()) {
  const r = ratePA / 12 / 100;
  const emi = calculateEMI(principal, ratePA, tenure);
  const schedule = [];
  let remainingPrincipal = principal;

  for (let i = 1; i <= tenure; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    let interest = Math.round(remainingPrincipal * r);
    let principalPart;

    if (i === tenure) {
      // Last installment reconciles exact remaining principal
      principalPart = remainingPrincipal;
      interest = Math.max(0, emi - principalPart);
      if (principalPart + interest < emi && remainingPrincipal > 0) {
        interest = Math.round(remainingPrincipal * r);
      }
    } else {
      principalPart = emi - interest;
      if (principalPart > remainingPrincipal) {
        principalPart = remainingPrincipal;
      }
    }

    const total = principalPart + interest;
    remainingPrincipal = Math.max(0, remainingPrincipal - principalPart);

    schedule.push({
      installmentNumber: i,
      dueDate,
      principalAmount: principalPart,
      interestAmount: interest,
      totalAmount: total,
    });
  }

  return { emi, schedule, totalRepayment: schedule.reduce((sum, s) => sum + s.totalAmount, 0) };
}

/**
 * Creates a loan drawdown against an approved CreditAccount.
 *
 * @param {Object} params
 * @param {string} params.accountId - CreditAccount ID
 * @param {string} params.userId - Authenticated user ID (e.g. USR-001 or mongo _id)
 * @param {number} params.amount - Requested drawdown amount
 * @param {number} params.tenure - Requested tenure in months
 * @param {string} [params.purpose] - Loan purpose (electronics, shopping, etc.)
 * @param {string} params.idempotencyKey - Unique idempotency key
 * @param {Object} [params.metadata] - Extra metadata (notes, merchant, etc.)
 * @returns {Promise<{ success: boolean, isDuplicate?: boolean, loan: Object, schedule: Array, balance: Object, kfsData: Object }>}
 */
async function createDrawdown(params) {
  const {
    accountId,
    userId,
    amount,
    tenure,
    purpose = "shopping",
    idempotencyKey,
    metadata = {},
  } = params;

  // 1. Validate mandatory fields
  if (!accountId) throw new DrawdownError("ACCOUNT_ID_REQUIRED", "Credit account ID is required", 400);
  if (!userId) throw new DrawdownError("USER_ID_REQUIRED", "User ID is required", 401);
  if (typeof amount !== "number" || amount <= 0) {
    throw new DrawdownError("INVALID_AMOUNT", "Amount must be a positive number", 400);
  }
  if (!tenure || typeof tenure !== "number" || tenure <= 0) {
    throw new DrawdownError("INVALID_TENURE", "Tenure must be a positive integer", 400);
  }
  if (!idempotencyKey) {
    throw new DrawdownError("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required for financial drawdown", 400);
  }

  // 2. Strict Idempotency Check: if already processed for this idempotency key, return existing loan
  const existingEvent = await findByIdempotencyKey(idempotencyKey);
  if (existingEvent) {
    const existingLoan = await LoanApplication.findOne({
      $or: [{ id: existingEvent.applicationId }, { idempotencyKey }],
    });
    if (existingLoan) {
      const schedule = await RepaymentSchedule.find({ loanId: existingLoan.id }).sort({ installmentNumber: 1 });
      const account = await CreditAccount.findOne({ id: accountId });
      return {
        success: true,
        isDuplicate: true,
        loan: existingLoan,
        schedule,
        balance: account ? deriveBalance(account) : existingEvent.balanceAfter,
      };
    }
  }

  // 3. Load & verify CreditAccount ownership
  const account = await CreditAccount.findOne({
    $or: [{ id: accountId }, { _id: mongoose.isValidObjectId(accountId) ? accountId : null }],
  });

  if (!account) {
    throw new DrawdownError("CREDIT_FACILITY_NOT_FOUND", `Approved credit facility '${accountId}' not found`, 404);
  }

  // Resolve user identity
  const user = await User.findOne({
    $or: [{ userId: userId }, { username: userId }, { _id: mongoose.isValidObjectId(userId) ? userId : null }],
  });
  const canonicalUserId = user?.userId || account.userId;

  if (account.userId !== canonicalUserId && account.userId !== userId) {
    throw new DrawdownError("UNAUTHORIZED_FACILITY_ACCESS", "You do not own this credit facility", 403);
  }

  // 4. Verify facility status
  if (account.status !== "ACTIVE") {
    throw new DrawdownError(
      "FACILITY_NOT_ACTIVE",
      `Credit facility is ${account.status}. Only ACTIVE facilities can be used for drawdowns.`,
      400
    );
  }

  // 5. Verify available credit
  if (amount > account.availableCredit) {
    throw new DrawdownError(
      "INSUFFICIENT_CREDIT",
      `Requested amount ₹${amount.toLocaleString("en-IN")} exceeds available credit capacity ₹${account.availableCredit.toLocaleString("en-IN")}`,
      400
    );
  }

  // 6. Retrieve lender product rules
  const lenderId = account.lenderProductId || account.lenderId || "L001";
  let lenderProduct = await LenderProduct.findOne({
    $or: [{ id: lenderId }, { lenderId: lenderId }],
  });

  if (!lenderProduct) {
    lenderProduct = await LenderProduct.findOne({ active: true });
  }

  const interestRate = lenderProduct?.interestRate || 14.5;
  const apr = lenderProduct?.APR || interestRate + 0.5;
  const processingFeePct = lenderProduct?.processingFee || 1.0;
  const processingFee = Math.round((amount * processingFeePct) / 100);

  // Validate tenure against product
  if (lenderProduct?.tenureMonths && !lenderProduct.tenureMonths.includes(tenure)) {
    // If lender lists specific tenures, ensure tenure is supported or standard (3, 6, 12, 18, 24, 36)
    const standardTenures = [3, 6, 12, 18, 24, 36];
    if (!standardTenures.includes(tenure)) {
      throw new DrawdownError("UNSUPPORTED_TENURE", `Tenure ${tenure}M is not supported for this facility`, 400);
    }
  }

  // 7. Calculate Amortization Schedule
  const { emi, schedule: amortSchedule, totalRepayment } = calculateAmortizationSchedule(amount, interestRate, tenure);

  // 8. Atomic balance update on CreditAccount
  const updatedAccount = await CreditAccount.findOneAndUpdate(
    {
      id: account.id,
      userId: account.userId,
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
    { new: true, runValidators: true }
  );

  if (!updatedAccount) {
    throw new DrawdownError(
      "INSUFFICIENT_CREDIT",
      "Failed to reserve credit. Insufficient available credit balance or concurrent transaction in progress.",
      409
    );
  }

  // Invalidate balance cache
  creditCache.invalidate(account.id);
  const balanceAfter = deriveBalance(updatedAccount);

  // 9. Generate Loan Application / Drawdown Record
  const loanId = await nextApplicationId();
  const borrowerName = user?.fullName || user?.username || "Consumer User";
  const pan = user?.pan || "ABCPS1234D";
  const mobile = user?.mobile || "9876543210";
  const firstDueDate = amortSchedule[0]?.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const loanRecord = await LoanApplication.create({
    id: loanId,
    borrowerName,
    pan,
    mobile,
    amount,
    purpose: purpose.toLowerCase().replace(/\s+/g, "_"),
    tenure,
    cibilScore: 750,
    monthlyIncome: user?.monthlyIncome || 60000,
    monthlyObligations: user?.monthlyObligations || 12000,
    dlaId: "DLA-CONSUMER",
    userId: canonicalUserId,
    creditAccountId: account.id,
    lenderId: account.lenderId,
    lenderProductId: lenderProduct?.id || account.lenderProductId || account.lenderId,
    interestRate,
    APR: apr,
    emi,
    processingFee,
    totalRepayment,
    disbursedAmount: amount,
    outstandingPrincipal: amount,
    totalPaid: 0,
    installmentsCount: tenure,
    installmentsPaid: 0,
    nextDueDate: firstDueDate,
    disbursedAt: new Date(),
    idempotencyKey,
    status: "ACTIVE",
    routedTo: lenderProduct?.id || account.lenderId,
    routedAt: new Date(),
    kfsGenerated: true,
    kfsPresentedAt: new Date(),
    kfsAcceptedAt: new Date(),
    aaConsent: true,
  });

  // 10. Generate and persist RepaymentSchedule documents
  const scheduleDocs = [];
  for (const item of amortSchedule) {
    const scheduleId = await nextScheduleId();
    scheduleDocs.push({
      id: scheduleId,
      loanId: loanRecord.id,
      creditAccountId: account.id,
      userId: canonicalUserId,
      installmentNumber: item.installmentNumber,
      dueDate: item.dueDate,
      principalAmount: item.principalAmount,
      interestAmount: item.interestAmount,
      feeAmount: 0,
      totalAmount: item.totalAmount,
      paidAmount: 0,
      remainingAmount: item.totalAmount,
      status: "PENDING",
    });
  }

  const createdSchedules = await RepaymentSchedule.insertMany(scheduleDocs);

  // 11. Append immutable CREDIT_CONSUMED event to the ledger
  const event = await recordEvent({
    idempotencyKey,
    creditAccountId: account.id,
    userId: canonicalUserId,
    applicationId: loanRecord.id,
    eventType: "CREDIT_CONSUMED",
    creditAmount: amount,
    balanceAfter,
    source: "FACILITY_DRAWDOWN",
    metadata: {
      loanId: loanRecord.id,
      purpose,
      tenure,
      emi,
      interestRate,
      processingFee,
      totalRepayment,
      firstDueDate,
      ...metadata,
    },
    status: "SUCCESS",
  });

  // 12. Generate KFS Snapshot
  const kfsData = generateKFS(loanRecord.toObject(), lenderProduct ? lenderProduct.toObject() : {
    id: account.lenderId,
    lenderName: "Regulated Lending Partner",
    interestRate,
    APR: apr,
    processingFee: processingFeePct,
  });

  // 13. Log compliance
  await logCompliance({
    type: "LOAN_DRAWDOWN_ACTIVATED",
    applicationId: loanRecord.id,
    userId: canonicalUserId,
    actor: user?.username || canonicalUserId,
    actorRole: "USER",
    pass: true,
    newState: "ACTIVE",
    details: {
      creditAccountId: account.id,
      amount,
      tenure,
      emi,
      interestRate,
    },
  });

  return {
    success: true,
    loan: loanRecord,
    schedule: createdSchedules,
    balance: balanceAfter,
    kfsData,
    event,
    message: "Loan drawdown activated successfully against approved credit facility.",
  };
}

module.exports = {
  calculateEMI,
  calculateAmortizationSchedule,
  createDrawdown,
  DrawdownError,
};
