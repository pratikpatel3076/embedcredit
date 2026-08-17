const mongoose = require("mongoose");
const CreditAccount = require("../../models/CreditAccount");
const CreditConsumptionEvent = require("../../models/CreditConsumptionEvent");
const LoanApplication = require("../../models/LoanApplication");
const RepaymentSchedule = require("../../models/RepaymentSchedule");
const Repayment = require("../../models/Repayment");
const User = require("../../models/User");
const { nextRepaymentId } = require("../../utils/idGenerator");
const { recordEvent, findByIdempotencyKey } = require("./creditEvent.service");
const { deriveBalance } = require("./creditBalance.service");
const { logCompliance } = require("../../middleware/rbiCompliance");
const creditCache = require("./creditCache.service");

class RepaymentError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Process a repayment against an active loan installment.
 * Restores available credit capacity strictly by the principal component of the payment.
 *
 * @param {Object} params
 * @param {string} params.loanId - Loan ID (e.g. APP-001)
 * @param {string} [params.installmentId] - Target installment ID (e.g. SCH-0001)
 * @param {number} [params.amount] - Payment amount (defaults to installment remainingAmount)
 * @param {string} params.userId - Authenticated user ID
 * @param {string} [params.paymentMethod] - UPI_AUTOPAY | NET_BANKING | DEBIT_CARD | ENACH
 * @param {string} [params.paymentReference] - External transaction ref
 * @param {string} [params.idempotencyKey] - Idempotency key
 * @returns {Promise<{ success: boolean, repayment: Object, installment: Object, loan: Object, balance: Object }>}
 */
async function processRepayment(params) {
  const {
    loanId,
    installmentId = null,
    amount: userAmount = null,
    userId,
    paymentMethod = "UPI_AUTOPAY",
    paymentReference = null,
    idempotencyKey = null,
  } = params;

  if (!loanId) throw new RepaymentError("LOAN_ID_REQUIRED", "Loan ID is required", 400);
  if (!userId) throw new RepaymentError("USER_ID_REQUIRED", "User ID is required", 401);

  // 1. Idempotency check if idempotencyKey is supplied
  if (idempotencyKey) {
    const existingRepayment = await Repayment.findOne({ idempotencyKey });
    if (existingRepayment) {
      const loan = await LoanApplication.findOne({ id: loanId });
      const schedule = await RepaymentSchedule.find({ loanId }).sort({ installmentNumber: 1 });
      const account = loan?.creditAccountId ? await CreditAccount.findOne({ id: loan.creditAccountId }) : null;
      return {
        success: true,
        isDuplicate: true,
        repayment: existingRepayment,
        loan,
        schedule,
        balance: account ? deriveBalance(account) : null,
      };
    }
  }

  // 2. Load Loan
  const loan = await LoanApplication.findOne({ id: loanId });
  if (!loan) {
    throw new RepaymentError("LOAN_NOT_FOUND", `Loan '${loanId}' not found`, 404);
  }

  // Verify ownership
  const user = await User.findOne({
    $or: [{ userId: userId }, { username: userId }, { _id: mongoose.isValidObjectId(userId) ? userId : null }],
  });
  const canonicalUserId = user?.userId || loan.userId;

  if (loan.userId && loan.userId !== canonicalUserId && loan.userId !== userId) {
    throw new RepaymentError("UNAUTHORIZED_LOAN_ACCESS", "You do not own this loan", 403);
  }

  if (loan.status === "CLOSED" || loan.status === "FULLY_REPAID") {
    throw new RepaymentError("LOAN_ALREADY_CLOSED", "This loan is already fully repaid and closed", 400);
  }

  // 3. Find target installment
  let targetInstallment = null;
  if (installmentId) {
    targetInstallment = await RepaymentSchedule.findOne({
      $or: [{ id: installmentId }, { _id: mongoose.isValidObjectId(installmentId) ? installmentId : null }],
      loanId: loan.id,
    });
  } else {
    // Pick earliest unpaid or partially paid installment
    targetInstallment = await RepaymentSchedule.findOne({
      loanId: loan.id,
      status: { $in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
    }).sort({ installmentNumber: 1 });
  }

  if (!targetInstallment) {
    throw new RepaymentError("NO_PENDING_INSTALLMENT", "No pending installments found for this loan", 400);
  }

  if (targetInstallment.status === "PAID") {
    throw new RepaymentError("INSTALLMENT_ALREADY_PAID", "Target installment is already marked as PAID", 400);
  }

  // Determine repayment amount
  const remainingInstallment = targetInstallment.remainingAmount;
  const payAmount = userAmount !== null && userAmount > 0 ? Number(userAmount) : remainingInstallment;

  if (payAmount <= 0) {
    throw new RepaymentError("INVALID_REPAYMENT_AMOUNT", "Repayment amount must be greater than zero", 400);
  }

  // 4. Calculate Principal and Interest components
  // Interest is paid first up to the installment's unpaid interest; remainder pays principal
  const unpaidInterest = Math.max(0, targetInstallment.interestAmount - (targetInstallment.paidAmount > targetInstallment.principalAmount ? targetInstallment.paidAmount - targetInstallment.principalAmount : 0));
  let interestComponent = 0;
  let principalComponent = 0;

  if (payAmount >= remainingInstallment) {
    // Full installment payoff
    principalComponent = Math.min(targetInstallment.principalAmount, targetInstallment.remainingAmount);
    interestComponent = Math.max(0, payAmount - principalComponent);
  } else {
    // Partial payment
    if (payAmount <= unpaidInterest) {
      interestComponent = payAmount;
      principalComponent = 0;
    } else {
      interestComponent = unpaidInterest;
      principalComponent = payAmount - unpaidInterest;
    }
  }

  // 5. Update RepaymentSchedule
  const prevPaid = targetInstallment.paidAmount || 0;
  const newPaid = prevPaid + payAmount;
  const newRemaining = Math.max(0, targetInstallment.totalAmount - newPaid);
  const isInstallmentFullyPaid = newRemaining === 0 || newPaid >= targetInstallment.totalAmount;

  targetInstallment.paidAmount = newPaid;
  targetInstallment.remainingAmount = newRemaining;
  targetInstallment.status = isInstallmentFullyPaid ? "PAID" : "PARTIALLY_PAID";
  targetInstallment.paidAt = new Date();

  const refNumber = paymentReference || `UPI/REP/${Date.now().toString().slice(-8)}`;
  targetInstallment.paymentReference = refNumber;
  await targetInstallment.save();

  // 6. Update Loan Application
  const newOutstanding = Math.max(0, (loan.outstandingPrincipal || loan.amount) - principalComponent);
  const newTotalPaid = (loan.totalPaid || 0) + payAmount;
  loan.outstandingPrincipal = newOutstanding;
  loan.totalPaid = newTotalPaid;

  const totalSchedules = await RepaymentSchedule.countDocuments({ loanId: loan.id });
  const paidSchedules = await RepaymentSchedule.countDocuments({ loanId: loan.id, status: "PAID" });
  loan.installmentsCount = totalSchedules;
  loan.installmentsPaid = paidSchedules;

  // Find next due date
  const nextPending = await RepaymentSchedule.findOne({
    loanId: loan.id,
    status: { $in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
  }).sort({ installmentNumber: 1 });

  loan.nextDueDate = nextPending ? nextPending.dueDate : null;

  if (paidSchedules >= totalSchedules || newOutstanding === 0) {
    loan.status = "CLOSED";
    loan.closedAt = new Date();
  } else {
    loan.status = "PARTIALLY_REPAID";
  }
  await loan.save();

  // 7. Update CreditAccount (Restores Available Credit strictly by Principal Component)
  let updatedAccount = null;
  let balanceAfter = null;

  if (loan.creditAccountId && principalComponent > 0) {
    updatedAccount = await CreditAccount.findOneAndUpdate(
      {
        id: loan.creditAccountId,
        utilizedCredit: { $gte: principalComponent },
      },
      {
        $inc: {
          utilizedCredit: -principalComponent,
          availableCredit: principalComponent,
          version: 1,
        },
        $set: { lastActivityAt: new Date() },
      },
      { new: true, runValidators: true }
    );

    if (updatedAccount) {
      creditCache.invalidate(loan.creditAccountId);
      balanceAfter = deriveBalance(updatedAccount);
    }
  }

  // 8. Record Repayment document
  const repaymentId = await nextRepaymentId();
  const repaymentRecord = await Repayment.create({
    id: repaymentId,
    loanId: loan.id,
    installmentId: targetInstallment.id,
    creditAccountId: loan.creditAccountId || "CRD-ACC-001",
    userId: canonicalUserId,
    amount: payAmount,
    principalComponent,
    interestComponent,
    feeComponent: 0,
    paymentReference: refNumber,
    status: "SUCCESS",
    paymentMethod,
    idempotencyKey,
    paidAt: new Date(),
    metadata: {
      installmentNumber: targetInstallment.installmentNumber,
      isFullyPaid: isInstallmentFullyPaid,
      outstandingPrincipalAfter: newOutstanding,
    },
  });

  targetInstallment.repaymentId = repaymentRecord.id;
  await targetInstallment.save();

  // 9. Append immutable CREDIT_REPAID event to ledger
  if (loan.creditAccountId) {
    await recordEvent({
      idempotencyKey: idempotencyKey ? `${idempotencyKey}-evt` : null,
      creditAccountId: loan.creditAccountId,
      userId: canonicalUserId,
      applicationId: loan.id,
      eventType: "CREDIT_REPAID",
      creditAmount: principalComponent,
      balanceAfter: balanceAfter || { availableCredit: 0, utilizedCredit: 0, reservedCredit: 0, creditLimit: 0 },
      source: "REPAYMENT_SERVICE",
      metadata: {
        repaymentId: repaymentRecord.id,
        loanId: loan.id,
        installmentId: targetInstallment.id,
        totalAmountPaid: payAmount,
        principalComponent,
        interestComponent,
        paymentReference: refNumber,
      },
      status: "SUCCESS",
    });
  }

  // 10. Compliance logging
  await logCompliance({
    type: "LOAN_REPAYMENT_RECORDED",
    applicationId: loan.id,
    userId: canonicalUserId,
    actor: user?.username || canonicalUserId,
    actorRole: "USER",
    pass: true,
    details: {
      repaymentId: repaymentRecord.id,
      amount: payAmount,
      principalComponent,
      interestComponent,
      newOutstandingPrincipal: newOutstanding,
      loanStatus: loan.status,
    },
  });

  return {
    success: true,
    repayment: repaymentRecord,
    installment: targetInstallment,
    loan,
    balance: balanceAfter,
    message: isInstallmentFullyPaid
      ? `Installment #${targetInstallment.installmentNumber} paid in full. ₹${principalComponent.toLocaleString("en-IN")} principal restored to available credit.`
      : `Partial payment of ₹${payAmount.toLocaleString("en-IN")} recorded. Remaining: ₹${newRemaining.toLocaleString("en-IN")}`,
  };
}

/**
 * Process early foreclosure / full outstanding payoff of a loan.
 *
 * @param {Object} params
 * @param {string} params.loanId
 * @param {string} params.userId
 * @param {string} [params.paymentMethod]
 * @param {string} [params.paymentReference]
 * @returns {Promise<Object>}
 */
async function processForeclosure(params) {
  const { loanId, userId, paymentMethod = "UPI_AUTOPAY", paymentReference = null } = params;

  const loan = await LoanApplication.findOne({ id: loanId });
  if (!loan) throw new RepaymentError("LOAN_NOT_FOUND", `Loan '${loanId}' not found`, 404);

  if (loan.status === "CLOSED" || loan.status === "FULLY_REPAID") {
    throw new RepaymentError("LOAN_ALREADY_CLOSED", "This loan is already closed", 400);
  }

  const user = await User.findOne({
    $or: [{ userId: userId }, { username: userId }, { _id: mongoose.isValidObjectId(userId) ? userId : null }],
  });
  const canonicalUserId = user?.userId || loan.userId;

  // Find all unpaid installments
  const pendingSchedules = await RepaymentSchedule.find({
    loanId: loan.id,
    status: { $in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
  }).sort({ installmentNumber: 1 });

  if (pendingSchedules.length === 0) {
    loan.status = "CLOSED";
    loan.closedAt = new Date();
    await loan.save();
    return { success: true, message: "No pending installments found. Loan closed.", loan };
  }

  // Calculate total outstanding principal to settle
  const outstandingPrincipal = loan.outstandingPrincipal || pendingSchedules.reduce((s, sch) => s + (sch.remainingAmount || sch.principalAmount), 0);
  const totalSettlementAmount = pendingSchedules.reduce((sum, sch) => sum + sch.remainingAmount, 0);

  const refNumber = paymentReference || `UPI/FORECLOSE/${Date.now().toString().slice(-8)}`;

  // Mark all pending schedules as PAID
  for (const sch of pendingSchedules) {
    sch.paidAmount = sch.totalAmount;
    sch.remainingAmount = 0;
    sch.status = "PAID";
    sch.paidAt = new Date();
    sch.paymentReference = refNumber;
    await sch.save();
  }

  // Close loan
  loan.outstandingPrincipal = 0;
  loan.totalPaid = (loan.totalPaid || 0) + totalSettlementAmount;
  loan.installmentsPaid = await RepaymentSchedule.countDocuments({ loanId: loan.id });
  loan.status = "CLOSED";
  loan.closedAt = new Date();
  loan.nextDueDate = null;
  await loan.save();

  // Restore available credit on facility
  let balanceAfter = null;
  if (loan.creditAccountId && outstandingPrincipal > 0) {
    const updatedAccount = await CreditAccount.findOneAndUpdate(
      {
        id: loan.creditAccountId,
        utilizedCredit: { $gte: outstandingPrincipal },
      },
      {
        $inc: {
          utilizedCredit: -outstandingPrincipal,
          availableCredit: outstandingPrincipal,
          version: 1,
        },
        $set: { lastActivityAt: new Date() },
      },
      { new: true, runValidators: true }
    );

    if (updatedAccount) {
      creditCache.invalidate(loan.creditAccountId);
      balanceAfter = deriveBalance(updatedAccount);
    }
  }

  // Record Repayment
  const repaymentId = await nextRepaymentId();
  const repaymentRecord = await Repayment.create({
    id: repaymentId,
    loanId: loan.id,
    creditAccountId: loan.creditAccountId || "CRD-ACC-001",
    userId: canonicalUserId,
    amount: totalSettlementAmount,
    principalComponent: outstandingPrincipal,
    interestComponent: totalSettlementAmount - outstandingPrincipal,
    feeComponent: 0,
    paymentReference: refNumber,
    status: "SUCCESS",
    paymentMethod,
    paidAt: new Date(),
    metadata: {
      isForeclosure: true,
      settledInstallmentsCount: pendingSchedules.length,
    },
  });

  // Record CREDIT_REPAID event
  if (loan.creditAccountId) {
    await recordEvent({
      creditAccountId: loan.creditAccountId,
      userId: canonicalUserId,
      applicationId: loan.id,
      eventType: "CREDIT_REPAID",
      creditAmount: outstandingPrincipal,
      balanceAfter: balanceAfter || { availableCredit: 0, utilizedCredit: 0, reservedCredit: 0, creditLimit: 0 },
      source: "FORECLOSURE_SETTLEMENT",
      metadata: {
        repaymentId: repaymentRecord.id,
        loanId: loan.id,
        totalSettlementAmount,
        outstandingPrincipal,
        isForeclosure: true,
      },
      status: "SUCCESS",
    });
  }

  // Compliance log
  await logCompliance({
    type: "LOAN_FORECLOSED",
    applicationId: loan.id,
    userId: canonicalUserId,
    actor: user?.username || canonicalUserId,
    actorRole: "USER",
    pass: true,
    newState: "CLOSED",
    details: {
      repaymentId: repaymentRecord.id,
      totalSettlementAmount,
      principalRestored: outstandingPrincipal,
    },
  });

  return {
    success: true,
    loan,
    repayment: repaymentRecord,
    balance: balanceAfter,
    message: `Loan #${loan.id} fully foreclosed and settled. ₹${outstandingPrincipal.toLocaleString("en-IN")} restored to available credit.`,
  };
}

/**
 * Get detailed loan profile with schedule, dynamic overdue evaluations, and payment history.
 *
 * @param {string} loanId
 * @param {string} [userId]
 * @returns {Promise<Object>}
 */
async function getLoanWithSchedule(loanId, userId = null) {
  const loan = await LoanApplication.findOne({
    $or: [{ id: loanId }, { _id: mongoose.isValidObjectId(loanId) ? loanId : null }],
  });

  if (!loan) {
    throw new RepaymentError("LOAN_NOT_FOUND", `Loan '${loanId}' not found`, 404);
  }

  const rawSchedules = await RepaymentSchedule.find({ loanId: loan.id }).sort({ installmentNumber: 1 });
  const repayments = await Repayment.find({ loanId: loan.id }).sort({ createdAt: -1 });

  const now = new Date();
  // Dynamic overdue evaluation
  const schedules = rawSchedules.map((s) => {
    const sObj = s.toObject();
    if (sObj.status === "PENDING" && new Date(sObj.dueDate) < now) {
      sObj.status = "OVERDUE";
    }
    return sObj;
  });

  const totalInstallments = schedules.length;
  const paidInstallments = schedules.filter((s) => s.status === "PAID").length;
  const overdueInstallments = schedules.filter((s) => s.status === "OVERDUE").length;

  const nextInstallment = schedules.find((s) => s.status === "PENDING" || s.status === "OVERDUE" || s.status === "PARTIALLY_PAID") || null;

  return {
    loan,
    schedules,
    repayments,
    summary: {
      totalInstallments,
      paidInstallments,
      overdueInstallments,
      progressPercentage: totalInstallments > 0 ? Math.round((paidInstallments / totalInstallments) * 100) : 0,
      nextInstallment,
      outstandingPrincipal: loan.outstandingPrincipal || 0,
      totalRepaid: loan.totalPaid || 0,
    },
  };
}

module.exports = {
  processRepayment,
  processForeclosure,
  getLoanWithSchedule,
  RepaymentError,
};
