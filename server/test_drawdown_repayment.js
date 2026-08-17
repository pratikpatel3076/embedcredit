const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const CreditAccount = require("./models/CreditAccount");
const CreditConsumptionEvent = require("./models/CreditConsumptionEvent");
const LoanApplication = require("./models/LoanApplication");
const LenderProduct = require("./models/LenderProduct");
const RepaymentSchedule = require("./models/RepaymentSchedule");
const Repayment = require("./models/Repayment");
const User = require("./models/User");
const CreditService = require("./services/credit");

let mongod;

async function setup() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  console.log("Connected to in-memory test database for drawdown & repayment testing");

  // Create test lender product
  await LenderProduct.create({
    id: "L001",
    lenderName: "CreditSaison Prime",
    type: "NBFC",
    minAmount: 5000,
    maxAmount: 200000,
    interestRate: 14.5,
    APR: 15.0,
    tenureMonths: [3, 6, 12, 18, 24, 36],
    minCibilScore: 650,
    maxDti: 0.5,
    processingFee: 1.0,
    disbursalTime: "T+0",
    supportedPurposes: ["shopping", "electronics", "travel", "medical", "personal"],
    active: true,
  });

  // Create test user
  await User.create({
    userId: "USR-D1",
    username: "rahul_verma",
    email: "rahul@example.com",
    role: "USER",
    fullName: "Rahul Verma",
    pan: "ABCPS1234D",
    mobile: "9876543210",
    passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
  });

  await User.create({
    userId: "USR-RACE",
    username: "race_tester",
    email: "race@example.com",
    role: "USER",
    fullName: "Race Tester",
    pan: "XYZPS9876Q",
    mobile: "9876543211",
    passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
  });
}

async function teardown() {
  await mongoose.disconnect();
  await mongod.stop();
  console.log("Test database stopped");
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  await setup();
  console.log("\n========================================================");
  console.log("  DRAWDOWN → LOAN → INSTALLMENT REPAYMENT TEST SUITE   ");
  console.log("========================================================\n");

  try {
    // ----------------------------------------------------
    // TEST 1: Create Approved Facility and Drawdown Active Loan
    // ----------------------------------------------------
    console.log("TEST 1: Drawdown from Approved Facility & Schedule Generation");
    const facility1 = await CreditService.createCreditAccount({
      userId: "USR-D1",
      lenderId: "L001",
      lenderProductId: "L001",
      creditLimit: 100000,
      source: "LENDER_APPROVAL",
    });

    assert(facility1.availableCredit === 100000, "Approved facility initialized with ₹100,000 available credit");

    // Execute Drawdown: ₹20,000 for 6 months
    const drawdown1 = await CreditService.createDrawdown({
      accountId: facility1.id,
      userId: "USR-D1",
      amount: 20000,
      tenure: 6,
      purpose: "electronics",
      idempotencyKey: "drawdown-key-001",
      metadata: { item: "Laptop Purchase" },
    });

    assert(drawdown1.success === true, "Drawdown request succeeded");
    assert(drawdown1.loan.amount === 20000, "Loan record created for ₹20,000");
    assert(drawdown1.loan.status === "ACTIVE", "Loan status is ACTIVE");
    assert(drawdown1.loan.creditAccountId === facility1.id, "Loan linked to CreditAccount");
    assert(drawdown1.loan.interestRate === 14.5, "Interest rate derived from lender product (14.5%)");
    assert(drawdown1.loan.emi > 0, `Monthly EMI calculated: ₹${drawdown1.loan.emi}`);

    // Verify Repayment Schedule
    assert(drawdown1.schedule.length === 6, "Exactly 6 monthly installment records generated");
    const totalPrincipalScheduled = drawdown1.schedule.reduce((sum, s) => sum + s.principalAmount, 0);
    assert(totalPrincipalScheduled === 20000, `Sum of scheduled principal (₹${totalPrincipalScheduled}) exactly equals ₹20,000`);

    // Verify Facility Balance Invariant
    assert(drawdown1.balance.availableCredit === 80000, "Available credit reduced to ₹80,000");
    assert(drawdown1.balance.utilizedCredit === 20000, "Utilized credit increased to ₹20,000");
    const updatedFacility1 = await CreditAccount.findOne({ id: facility1.id });
    assert(CreditService.verifyBalanceInvariant(updatedFacility1), "Invariant: 80k + 20k + 0 == 100k");

    // Verify Event Ledger
    const events = await CreditConsumptionEvent.find({ creditAccountId: facility1.id });
    const drawdownEvent = events.find((e) => e.eventType === "CREDIT_CONSUMED");
    assert(drawdownEvent !== undefined, "CREDIT_CONSUMED event recorded in immutable ledger");
    assert(drawdownEvent.applicationId === drawdown1.loan.id, "Consumption event linked to loan ID");

    // ----------------------------------------------------
    // TEST 2: Rejection of Overdraft (Requested > Available)
    // ----------------------------------------------------
    console.log("\nTEST 2: Insufficient Credit Drawdown Rejection");
    let overdraftError = null;
    try {
      await CreditService.createDrawdown({
        accountId: facility1.id,
        userId: "USR-D1",
        amount: 85000, // Available is 80,000
        tenure: 6,
        purpose: "shopping",
        idempotencyKey: "overdraft-key-001",
      });
    } catch (e) {
      overdraftError = e;
    }

    assert(overdraftError !== null, "Overdraft request rejected with error");
    assert(overdraftError.code === "INSUFFICIENT_CREDIT", "Error code is INSUFFICIENT_CREDIT");

    const facilityAfterOverdraft = await CreditAccount.findOne({ id: facility1.id });
    assert(facilityAfterOverdraft.availableCredit === 80000, "Available credit remained unchanged at ₹80,000");

    // ----------------------------------------------------
    // TEST 3: Idempotent Drawdown Deduplication
    // ----------------------------------------------------
    console.log("\nTEST 3: Idempotent Drawdown Deduplication");
    const retryDrawdown = await CreditService.createDrawdown({
      accountId: facility1.id,
      userId: "USR-D1",
      amount: 20000,
      tenure: 6,
      purpose: "electronics",
      idempotencyKey: "drawdown-key-001", // Exact duplicate key
    });

    assert(retryDrawdown.success === true && retryDrawdown.isDuplicate === true, "Duplicate drawdown detected as idempotent retry");
    assert(retryDrawdown.loan.id === drawdown1.loan.id, "Returned original loan ID");
    const loansCount = await LoanApplication.countDocuments({ idempotencyKey: "drawdown-key-001" });
    assert(loansCount === 1, "Only 1 loan stored in database for this idempotency key");

    // ----------------------------------------------------
    // TEST 4: Concurrent Drawdown Race Condition Prevention
    // ----------------------------------------------------
    console.log("\nTEST 4: Concurrent Drawdowns & Invariant Integrity");
    const raceFacility = await CreditService.createCreditAccount({
      userId: "USR-RACE",
      lenderId: "L001",
      creditLimit: 15000,
    });

    // Fire 2 simultaneous drawdowns of ₹10,000 each (Total ₹20,000 > ₹15,000 available)
    const [resA, resB] = await Promise.allSettled([
      CreditService.createDrawdown({
        accountId: raceFacility.id,
        userId: "USR-RACE",
        amount: 10000,
        tenure: 6,
        idempotencyKey: "race-drawdown-A",
      }),
      CreditService.createDrawdown({
        accountId: raceFacility.id,
        userId: "USR-RACE",
        amount: 10000,
        tenure: 6,
        idempotencyKey: "race-drawdown-B",
      }),
    ]);

    const aPassed = resA.status === "fulfilled";
    const bPassed = resB.status === "fulfilled";
    assert((aPassed && !bPassed) || (!aPassed && bPassed), "Exactly ONE of the concurrent drawdowns succeeded");

    const finalRaceFacility = await CreditAccount.findOne({ id: raceFacility.id });
    assert(finalRaceFacility.availableCredit === 5000, "Available credit is exactly ₹5,000 (15k - 10k)");
    assert(finalRaceFacility.utilizedCredit === 10000, "Utilized credit is exactly ₹10,000");
    assert(CreditService.verifyBalanceInvariant(finalRaceFacility), "Invariant maintained: 5k + 10k == 15k");

    // ----------------------------------------------------
    // TEST 5: Installment Repayment & Principal-Only Restoration
    // ----------------------------------------------------
    console.log("\nTEST 5: Installment Repayment & Principal-Only Credit Restoration");
    const loanToRepay = drawdown1.loan;
    const scheduleToRepay = await RepaymentSchedule.find({ loanId: loanToRepay.id }).sort({ installmentNumber: 1 });
    const firstInstallment = scheduleToRepay[0];

    const facilityBeforeRepay = await CreditAccount.findOne({ id: facility1.id });
    const availBefore = facilityBeforeRepay.availableCredit; // 80,000
    const utilBefore = facilityBeforeRepay.utilizedCredit; // 20,000

    // Repay installment #1 in full
    const repayResult = await CreditService.processRepayment({
      loanId: loanToRepay.id,
      installmentId: firstInstallment.id,
      amount: firstInstallment.totalAmount,
      userId: "USR-D1",
      paymentMethod: "UPI_AUTOPAY",
      idempotencyKey: "repay-key-inst-1",
    });

    assert(repayResult.success === true, "Repayment succeeded");
    assert(repayResult.installment.status === "PAID", "Installment #1 marked as PAID");
    assert(repayResult.repayment.principalComponent === firstInstallment.principalAmount, `Principal component is ₹${firstInstallment.principalAmount}`);

    // Verify Loan balance updated
    const updatedLoanAfterRepay = await LoanApplication.findOne({ id: loanToRepay.id });
    assert(updatedLoanAfterRepay.outstandingPrincipal === 20000 - firstInstallment.principalAmount, `Outstanding principal reduced to ₹${updatedLoanAfterRepay.outstandingPrincipal}`);
    assert(updatedLoanAfterRepay.installmentsPaid === 1, "Installments paid count is 1");
    assert(updatedLoanAfterRepay.status === "PARTIALLY_REPAID", "Loan status transitioned to PARTIALLY_REPAID");

    // Verify Available Credit Restored ONLY by Principal portion
    const facilityAfterRepay = await CreditAccount.findOne({ id: facility1.id });
    assert(
      facilityAfterRepay.availableCredit === availBefore + firstInstallment.principalAmount,
      `Available credit increased by principal (₹${firstInstallment.principalAmount}) from ₹${availBefore} to ₹${facilityAfterRepay.availableCredit}`
    );
    assert(
      facilityAfterRepay.utilizedCredit === utilBefore - firstInstallment.principalAmount,
      `Utilized credit decreased by principal to ₹${facilityAfterRepay.utilizedCredit}`
    );
    assert(CreditService.verifyBalanceInvariant(facilityAfterRepay), "Invariant strictly preserved");

    // Verify Repayment Document & Event Ledger
    const repDoc = await Repayment.findOne({ loanId: loanToRepay.id });
    assert(repDoc !== null, "Repayment transaction record created");
    assert(repDoc.status === "SUCCESS", "Repayment record status is SUCCESS");

    const repayEvents = await CreditConsumptionEvent.find({ creditAccountId: facility1.id, eventType: "CREDIT_REPAID" });
    assert(repayEvents.length >= 1, "CREDIT_REPAID event appended to ledger");

    // ----------------------------------------------------
    // TEST 6: Partial Installment Repayment
    // ----------------------------------------------------
    console.log("\nTEST 6: Partial Installment Repayment");
    const secondInstallment = scheduleToRepay[1];
    const partialAmount = 1500; // Total is ~3,478

    const partialRepay = await CreditService.processRepayment({
      loanId: loanToRepay.id,
      installmentId: secondInstallment.id,
      amount: partialAmount,
      userId: "USR-D1",
      paymentMethod: "DEBIT_CARD",
      idempotencyKey: "partial-repay-key-2",
    });

    assert(partialRepay.success === true, "Partial repayment accepted");
    assert(partialRepay.installment.status === "PARTIALLY_PAID", "Installment status updated to PARTIALLY_PAID");
    assert(partialRepay.installment.paidAmount === partialAmount, "Paid amount recorded as ₹1,500");
    assert(partialRepay.installment.remainingAmount === secondInstallment.totalAmount - partialAmount, "Remaining amount calculated accurately");

    // ----------------------------------------------------
    // TEST 7: Early Foreclosure / Full Outstanding Payoff
    // ----------------------------------------------------
    console.log("\nTEST 7: Early Foreclosure & Full Loan Closure");
    const forecloseResult = await CreditService.processForeclosure({
      loanId: loanToRepay.id,
      userId: "USR-D1",
      paymentMethod: "UPI_AUTOPAY",
    });

    assert(forecloseResult.success === true, "Foreclosure completed successfully");
    const closedLoan = await LoanApplication.findOne({ id: loanToRepay.id });
    assert(closedLoan.status === "CLOSED", "Loan status updated to CLOSED");
    assert(closedLoan.outstandingPrincipal === 0, "Outstanding principal is 0");

    // All installments should be PAID
    const remainingUnpaid = await RepaymentSchedule.countDocuments({
      loanId: loanToRepay.id,
      status: { $ne: "PAID" },
    });
    assert(remainingUnpaid === 0, "All installments marked as PAID");

    // Facility capacity should be fully restored to original ₹100,000 limit
    const fullyRestoredFacility = await CreditAccount.findOne({ id: facility1.id });
    assert(fullyRestoredFacility.utilizedCredit === 0, "Facility utilized credit returned to 0");
    assert(fullyRestoredFacility.availableCredit === 100000, "Facility available credit fully restored to ₹100,000");
    assert(CreditService.verifyBalanceInvariant(fullyRestoredFacility), "Invariant maintained: 100k + 0 == 100k");

    // ----------------------------------------------------
    // TEST 8: Dynamic Overdue Evaluation
    // ----------------------------------------------------
    console.log("\nTEST 8: Dynamic Overdue Schedule Evaluation");
    // Create loan with past due date
    const overdueLoan = await LoanApplication.create({
      id: "APP-OVERDUE-TEST",
      borrowerName: "Rahul Verma",
      pan: "ABCPS1234D",
      mobile: "9876543210",
      amount: 10000,
      tenure: 3,
      purpose: "shopping",
      cibilScore: 750,
      monthlyIncome: 60000,
      dlaId: "DLA-CONSUMER",
      userId: "USR-D1",
      status: "ACTIVE",
      outstandingPrincipal: 10000,
      aaConsent: true,
    });

    // Create installment with due date 10 days in past
    const pastDueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await RepaymentSchedule.create({
      id: "SCH-PAST-001",
      loanId: overdueLoan.id,
      creditAccountId: facility1.id,
      userId: "USR-D1",
      installmentNumber: 1,
      dueDate: pastDueDate,
      principalAmount: 3200,
      interestAmount: 200,
      totalAmount: 3400,
      remainingAmount: 3400,
      status: "PENDING",
    });

    const loanWithSchedule = await CreditService.getLoanWithSchedule(overdueLoan.id, "USR-D1");
    const pastInstallment = loanWithSchedule.schedules[0];
    assert(pastInstallment.status === "OVERDUE", "Past due installment dynamically evaluated as OVERDUE");
    assert(loanWithSchedule.summary.overdueInstallments === 1, "Summary reports 1 overdue installment");

  } catch (err) {
    console.error("Test failure:", err);
    failed++;
  } finally {
    await teardown();
  }

  console.log("\n========================================================");
  console.log(`  DRAWDOWN & REPAYMENT RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
