const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const CreditAccount = require("./models/CreditAccount");
const CreditConsumptionEvent = require("./models/CreditConsumptionEvent");
const CreditRule = require("./models/CreditRule");
const User = require("./models/User");
const CreditService = require("./services/credit");

let mongod;

async function setup() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  console.log("Connected to in-memory test database");
}

async function teardown() {
  await mongoose.disconnect();
  await mongod.stop();
  console.log("Test database disconnected and stopped");
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
  console.log("  EMBEDCREDIT CONSUMPTION CREDIT SUBSYSTEM TEST SUITE  ");
  console.log("========================================================\n");

  try {
    // ----------------------------------------------------
    // TEST 1: Credit Account Creation & Initial Balance Invariant
    // ----------------------------------------------------
    console.log("TEST 1: Credit Account Creation & Invariant Enforcement");
    const acc1 = await CreditService.createCreditAccount({
      userId: "USR-T1",
      lenderId: "L001",
      lenderProductId: "L001",
      creditLimit: 100000,
      source: "SYSTEM",
    });

    assert(acc1.id.startsWith("CRD-ACC-"), "Account ID generated with CRD-ACC prefix");
    assert(acc1.creditLimit === 100000, "Credit limit is ₹100,000");
    assert(acc1.availableCredit === 100000, "Available credit initialized to ₹100,000");
    assert(acc1.utilizedCredit === 0, "Utilized credit initialized to 0");
    assert(acc1.reservedCredit === 0, "Reserved credit initialized to 0");

    const invariantValid = CreditService.verifyBalanceInvariant(acc1);
    assert(invariantValid, "Invariant: available (100k) + utilized (0) + reserved (0) == limit (100k)");

    // Verify initial CREDIT_GRANTED event recorded
    const initialEvents = await CreditConsumptionEvent.find({ creditAccountId: acc1.id });
    assert(initialEvents.length === 1, "Initial CREDIT_GRANTED event recorded in ledger");
    assert(initialEvents[0].eventType === "CREDIT_GRANTED", "Event type is CREDIT_GRANTED");

    // ----------------------------------------------------
    // TEST 2: Normal Direct Consumption
    // ----------------------------------------------------
    console.log("\nTEST 2: Normal Direct Consumption");
    const consumeRes1 = await CreditService.consumeCredit({
      accountId: acc1.id,
      userId: "USR-T1",
      amount: 20000,
      idempotencyKey: "test-consume-key-001",
      purpose: "electronics",
      source: "CONSUMER_PORTAL",
      metadata: { item: "4K Monitor" },
    });

    assert(consumeRes1.success === true, "Direct consumption of ₹20,000 succeeded");
    assert(consumeRes1.balance.availableCredit === 80000, "Available credit decreased to ₹80,000");
    assert(consumeRes1.balance.utilizedCredit === 20000, "Utilized credit increased to ₹20,000");
    assert(consumeRes1.balance.reservedCredit === 0, "Reserved credit remains 0");
    assert(consumeRes1.event.eventType === "CREDIT_CONSUMED", "Event CREDIT_CONSUMED appended");

    const updatedAcc1 = await CreditAccount.findOne({ id: acc1.id });
    assert(CreditService.verifyBalanceInvariant(updatedAcc1), "Invariant maintained: 80k + 20k + 0 == 100k");

    // ----------------------------------------------------
    // TEST 3: Concurrent Requests & Negative Balance Prevention
    // ----------------------------------------------------
    console.log("\nTEST 3: Concurrent Race Condition & Negative Balance Prevention");
    // Create an account with ₹5,000 limit
    const raceAcc = await CreditService.createCreditAccount({
      userId: "USR-RACE",
      lenderId: "L001",
      creditLimit: 5000,
    });

    assert(raceAcc.availableCredit === 5000, "Race test account created with ₹5,000 available");

    // Fire 2 simultaneous consumption requests of ₹4,000 each (Total ₹8,000 > ₹5,000)
    const [reqA, reqB] = await Promise.allSettled([
      CreditService.consumeCredit({
        accountId: raceAcc.id,
        userId: "USR-RACE",
        amount: 4000,
        idempotencyKey: "race-req-A",
        purpose: "shopping",
      }),
      CreditService.consumeCredit({
        accountId: raceAcc.id,
        userId: "USR-RACE",
        amount: 4000,
        idempotencyKey: "race-req-B",
        purpose: "shopping",
      }),
    ]);

    const reqASucceeded = reqA.status === "fulfilled";
    const reqBSucceeded = reqB.status === "fulfilled";

    assert((reqASucceeded && !reqBSucceeded) || (!reqASucceeded && reqBSucceeded), "Exactly ONE of the two concurrent ₹4,000 requests succeeded");

    const finalRaceAcc = await CreditAccount.findOne({ id: raceAcc.id });
    assert(finalRaceAcc.availableCredit >= 0, `Available credit is non-negative (Actual: ₹${finalRaceAcc.availableCredit})`);
    assert(finalRaceAcc.availableCredit === 1000, "Available credit accurately equals ₹1,000 (5,000 - 4,000)");
    assert(finalRaceAcc.utilizedCredit === 4000, "Utilized credit accurately equals ₹4,000");
    assert(CreditService.verifyBalanceInvariant(finalRaceAcc), "Invariant maintained: 1,000 + 4,000 == 5,000");

    // ----------------------------------------------------
    // TEST 4: Strict Idempotency Key Deduplication
    // ----------------------------------------------------
    console.log("\nTEST 4: Strict Idempotency Key Deduplication");
    const idempAcc = await CreditService.createCreditAccount({
      userId: "USR-IDEMP",
      lenderId: "L001",
      creditLimit: 50000,
    });

    const idempKey = "unique-idemp-key-xyz-789";

    // Request 1
    const firstCall = await CreditService.consumeCredit({
      accountId: idempAcc.id,
      userId: "USR-IDEMP",
      amount: 15000,
      idempotencyKey: idempKey,
      purpose: "travel",
    });

    assert(firstCall.success === true && !firstCall.isDuplicate, "First request processed successfully");
    assert(firstCall.balance.availableCredit === 35000, "Balance reduced to ₹35,000");

    // Request 2 (Exact duplicate retry with same idempotency key)
    const secondCall = await CreditService.consumeCredit({
      accountId: idempAcc.id,
      userId: "USR-IDEMP",
      amount: 15000,
      idempotencyKey: idempKey,
      purpose: "travel",
    });

    assert(secondCall.success === true && secondCall.isDuplicate === true, "Second duplicate request detected as idempotent retry");
    assert(secondCall.balance.availableCredit === 35000, "Available credit remains ₹35,000 (NOT debited twice!)");
    assert(secondCall.balance.utilizedCredit === 15000, "Utilized credit remains ₹15,000 (NOT debited twice!)");

    const idempEvents = await CreditConsumptionEvent.find({ idempotencyKey: idempKey });
    assert(idempEvents.length === 1, "Only 1 event stored in database for this idempotency key");

    // ----------------------------------------------------
    // TEST 5: Credit Reservation & Failure/Release Lifecycle
    // ----------------------------------------------------
    console.log("\nTEST 5: Credit Reservation & Failure/Release Lifecycle");
    const resAcc = await CreditService.createCreditAccount({
      userId: "USR-RES",
      lenderId: "L001",
      creditLimit: 30000,
    });

    // Step 1: Reserve ₹10,000
    const reserveRes = await CreditService.reserveCredit({
      accountId: resAcc.id,
      userId: "USR-RES",
      amount: 10000,
      idempotencyKey: "reserve-key-001",
      purpose: "travel",
    });

    assert(reserveRes.success === true, "Credit reservation of ₹10,000 succeeded");
    assert(reserveRes.balance.availableCredit === 20000, "Available credit reduced to ₹20,000");
    assert(reserveRes.balance.reservedCredit === 10000, "Reserved credit increased to ₹10,000");
    assert(reserveRes.balance.utilizedCredit === 0, "Utilized credit remains 0");

    // Step 2: Simulate failure / cancellation -> Release reservation
    const releaseRes = await CreditService.releaseCredit({
      reservationEventId: reserveRes.reservation.id,
      accountId: resAcc.id,
      userId: "USR-RES",
      idempotencyKey: "release-key-001",
      reason: "Booking checkout cancelled by user",
    });

    assert(releaseRes.success === true, "Reservation release succeeded");
    assert(releaseRes.balance.availableCredit === 30000, "Available credit fully restored to ₹30,000");
    assert(releaseRes.balance.reservedCredit === 0, "Reserved credit reduced to 0");
    assert(releaseRes.balance.utilizedCredit === 0, "Utilized credit remains 0");

    const releaseEvents = await CreditConsumptionEvent.find({ creditAccountId: resAcc.id });
    assert(releaseEvents.some((e) => e.eventType === "CREDIT_RELEASED"), "CREDIT_RELEASED event logged in ledger");

    // ----------------------------------------------------
    // TEST 6: Credit Reservation to Final Settlement/Consumption
    // ----------------------------------------------------
    console.log("\nTEST 6: Credit Reservation to Final Settlement/Consumption");
    const settleAcc = await CreditService.createCreditAccount({
      userId: "USR-SETTLE",
      lenderId: "L001",
      creditLimit: 50000,
    });

    // Reserve ₹15,000
    const settleReserve = await CreditService.reserveCredit({
      accountId: settleAcc.id,
      userId: "USR-SETTLE",
      amount: 15000,
      idempotencyKey: "settle-reserve-001",
      purpose: "shopping",
    });

    assert(settleReserve.balance.availableCredit === 35000, "Available: ₹35,000, Reserved: ₹15,000");

    // Settle / consume against reservation
    const settleConsume = await CreditService.consumeCredit({
      accountId: settleAcc.id,
      userId: "USR-SETTLE",
      amount: 15000,
      reservationEventId: settleReserve.reservation.id,
      idempotencyKey: "settle-consume-001",
      purpose: "shopping",
    });

    assert(settleConsume.success === true, "Reservation fulfilled and consumed successfully");
    assert(settleConsume.balance.availableCredit === 35000, "Available credit remains ₹35,000");
    assert(settleConsume.balance.reservedCredit === 0, "Reserved credit transitioned to 0");
    assert(settleConsume.balance.utilizedCredit === 15000, "Utilized credit transitioned to ₹15,000");

    const finalSettleAcc = await CreditAccount.findOne({ id: settleAcc.id });
    assert(CreditService.verifyBalanceInvariant(finalSettleAcc), "Invariant maintained: 35k + 15k + 0 == 50k");

    // ----------------------------------------------------
    // TEST 7: Repayment Event Flow
    // ----------------------------------------------------
    console.log("\nTEST 7: Repayment Event Flow");
    const repayAcc = await CreditService.createCreditAccount({
      userId: "USR-REPAY",
      lenderId: "L001",
      creditLimit: 100000,
    });

    // Consume ₹50,000
    await CreditService.consumeCredit({
      accountId: repayAcc.id,
      userId: "USR-REPAY",
      amount: 50000,
      idempotencyKey: "repay-consume-001",
      purpose: "shopping",
    });

    // Repay ₹20,000
    const repayRes = await CreditService.recordRepayment({
      accountId: repayAcc.id,
      userId: "USR-REPAY",
      amount: 20000,
      idempotencyKey: "repay-event-001",
      paymentReference: "UPI-AUTOPAY-998811",
      source: "SYSTEM",
    });

    assert(repayRes.success === true, "Repayment recorded successfully");
    assert(repayRes.balance.utilizedCredit === 30000, "Utilized credit decreased to ₹30,000 (50k - 20k)");
    assert(repayRes.balance.availableCredit === 70000, "Available credit increased to ₹70,000 (50k + 20k)");
    assert(repayRes.event.eventType === "CREDIT_REPAID", "CREDIT_REPAID event appended to ledger");

    const finalRepayAcc = await CreditAccount.findOne({ id: repayAcc.id });
    assert(CreditService.verifyBalanceInvariant(finalRepayAcc), "Invariant maintained: 70k + 30k + 0 == 100k");

    // ----------------------------------------------------
    // TEST 8: Reversal of Consumption Event
    // ----------------------------------------------------
    console.log("\nTEST 8: Reversal of Consumption Event");
    const revAcc = await CreditService.createCreditAccount({
      userId: "USR-REV",
      lenderId: "L001",
      creditLimit: 40000,
    });

    // Consume ₹12,000
    const consumeForRev = await CreditService.consumeCredit({
      accountId: revAcc.id,
      userId: "USR-REV",
      amount: 12000,
      idempotencyKey: "rev-consume-001",
      purpose: "electronics",
    });

    assert(consumeForRev.balance.availableCredit === 28000, "Available credit is ₹28,000 before reversal");

    // Reverse consumption
    const revRes = await CreditService.reverseConsumption({
      originalEventId: consumeForRev.event.id,
      accountId: revAcc.id,
      userId: "USR-REV",
      idempotencyKey: "rev-action-001",
      reason: "Merchant order cancelled",
      actor: "SUPPORT_SYSTEM",
    });

    assert(revRes.success === true, "Reversal processed successfully");
    assert(revRes.balance.availableCredit === 40000, "Available credit restored to ₹40,000");
    assert(revRes.balance.utilizedCredit === 0, "Utilized credit restored to 0");
    assert(revRes.reversalEvent.eventType === "CREDIT_REVERSED", "CREDIT_REVERSED event recorded");
    assert(revRes.reversalEvent.metadata.originalEventId === consumeForRev.event.id, "Reversal references original event ID");

    // Verify original event is not deleted and marked as REVERSED
    const origEvent = await CreditConsumptionEvent.findOne({ id: consumeForRev.event.id });
    assert(origEvent !== null, "Original event was NOT deleted (Immutable history preserved)");
    assert(origEvent.status === "REVERSED", "Original event status updated to REVERSED");

    // ----------------------------------------------------
    // TEST 9: Rules Engine Pre-Flight Checks
    // ----------------------------------------------------
    console.log("\nTEST 9: Rules Engine Pre-Flight Checks");
    const ruleAcc = await CreditService.createCreditAccount({
      userId: "USR-RULE",
      lenderId: "L001",
      creditLimit: 50000,
    });

    // 9A: Suspended account check
    await CreditService.updateAccountStatus(ruleAcc.id, "SUSPENDED", "Risk review");
    const suspendedCheck = await CreditService.evaluateTransactionRules({
      account: await CreditAccount.findOne({ id: ruleAcc.id }),
      amount: 5000,
      purpose: "shopping",
    });
    assert(suspendedCheck.allowed === false, "Transaction blocked on SUSPENDED account");

    // Restore to active
    await CreditService.updateAccountStatus(ruleAcc.id, "ACTIVE");

    // 9B: Max single transaction rule limit
    await CreditRule.create({
      ruleId: "TEST-RULE-MAX",
      ruleType: "MAX_SINGLE_TRANSACTION",
      threshold: { maxAmount: 10000 },
      action: "DENY",
      active: true,
    });

    const ruleCheckOver = await CreditService.evaluateTransactionRules({
      account: await CreditAccount.findOne({ id: ruleAcc.id }),
      amount: 15000, // > 10,000
      purpose: "shopping",
    });
    assert(ruleCheckOver.allowed === false, "Transaction exceeding max single transaction rule limit blocked");

    const ruleCheckUnder = await CreditService.evaluateTransactionRules({
      account: await CreditAccount.findOne({ id: ruleAcc.id }),
      amount: 8000, // <= 10,000
      purpose: "shopping",
    });
    assert(ruleCheckUnder.allowed === true, "Transaction within max single transaction rule limit allowed");

    // ----------------------------------------------------
    // TEST 10: Event Ledger Pagination & Filter Queries
    // ----------------------------------------------------
    console.log("\nTEST 10: Event Ledger Pagination & Filter Queries");
    const queryResult = await CreditService.queryEvents({
      userId: "USR-T1",
      page: 1,
      limit: 10,
    });

    assert(queryResult.total >= 2, `Found ${queryResult.total} ledger events for USR-T1`);
    assert(Array.isArray(queryResult.events), "Ledger query returns array of events");
    assert(queryResult.page === 1, "Page 1 returned");

  } catch (err) {
    console.error("Unexpected test exception:", err);
    failed++;
  } finally {
    await teardown();
  }

  console.log("\n========================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
