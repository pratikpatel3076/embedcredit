const LenderProduct = require("./models/LenderProduct");
const LoanApplication = require("./models/LoanApplication");
const ApplicationRoute = require("./models/ApplicationRoute");
const BorrowerProfile = require("./models/BorrowerProfile");
const ComplianceLog = require("./models/ComplianceLog");
const CreditProfile = require("./models/CreditProfile");
const ConsentRecord = require("./models/ConsentRecord");
const LoanIntent = require("./models/LoanIntent");
const LoanOffer = require("./models/LoanOffer");
const DLA = require("./models/DLA");
const DLGPortfolio = require("./models/DLGPortfolio");
const User = require("./models/User");
const bcrypt = require("bcryptjs");
const { runCreditEngine } = require("./services/creditEngine");
const { generateKFS } = require("./services/kfsGenerator");
const aaService = require("./services/aaService");

const LENDERS = [
  {
    id: "L001",
    lenderName: "CreditSaison India",
    type: "NBFC",
    minAmount: 10000,
    maxAmount: 500000,
    interestRate: 14.5,
    APR: 15.0,
    tenureMonths: [3, 6, 12, 18],
    minCibilScore: 650,
    maxDti: 0.45,
    processingFee: 1.5,
    disbursalTime: "T+1",
    supportedPurposes: ["personal", "consumer", "education", "electronics", "shopping"],
    ocenEnabled: true,
    aaEnabled: true,
    nachEnabled: true,
  },
  {
    id: "L002",
    lenderName: "Ugro Capital",
    type: "NBFC",
    minAmount: 50000,
    maxAmount: 2000000,
    interestRate: 16.0,
    APR: 16.5,
    tenureMonths: [6, 12, 24, 36],
    minCibilScore: 680,
    maxDti: 0.5,
    processingFee: 2.0,
    disbursalTime: "T+2",
    supportedPurposes: ["sme", "business", "working_capital"],
    ocenEnabled: false,
    aaEnabled: true,
    nachEnabled: true,
  },
  {
    id: "L003",
    lenderName: "HDFC Bank",
    type: "Bank",
    minAmount: 25000,
    maxAmount: 1500000,
    interestRate: 10.75,
    APR: 11.25,
    tenureMonths: [12, 24, 36, 48, 60],
    minCibilScore: 720,
    maxDti: 0.4,
    processingFee: 1.0,
    disbursalTime: "T+3",
    supportedPurposes: ["personal", "consumer", "medical", "electronics", "travel"],
    ocenEnabled: true,
    aaEnabled: true,
    nachEnabled: true,
  },
  {
    id: "L004",
    lenderName: "DMI Finance",
    type: "NBFC",
    minAmount: 5000,
    maxAmount: 200000,
    interestRate: 18.0,
    APR: 18.5,
    tenureMonths: [3, 6, 9, 12],
    minCibilScore: 620,
    maxDti: 0.55,
    processingFee: 2.5,
    disbursalTime: "T+0",
    supportedPurposes: ["personal", "consumer", "emergency", "shopping"],
    ocenEnabled: false,
    aaEnabled: false,
    nachEnabled: true,
  },
];

const APPLICATIONS = [
  {
    id: "APP-001",
    borrowerName: "Priya Sharma",
    pan: "ABCPS1234D",
    mobile: "9876543210",
    amount: 150000,
    purpose: "personal",
    tenure: 12,
    cibilScore: 740,
    monthlyIncome: 75000,
    monthlyObligations: 15000,
    dlaId: "DLA-001",
    status: "ROUTED",
    routedTo: "L003",
    routedAt: "2024-01-15T10:23:00Z",
    kfsGenerated: true,
    aaConsent: true,
    createdAt: "2024-01-15T10:00:00Z",
  },
  {
    id: "APP-002",
    borrowerName: "Rahul Mehta",
    pan: "PQRRM5678K",
    mobile: "9123456789",
    amount: 80000,
    purpose: "consumer",
    tenure: 6,
    cibilScore: 660,
    monthlyIncome: 40000,
    monthlyObligations: 8000,
    dlaId: "DLA-002",
    status: "pending_review",
    routedTo: null,
    routedAt: null,
    kfsGenerated: false,
    aaConsent: true,
    createdAt: "2024-01-16T09:15:00Z",
  },
  {
    id: "APP-003",
    borrowerName: "Anjali Patel",
    pan: "XYZAP9012L",
    mobile: "9988776655",
    amount: 500000,
    purpose: "sme",
    tenure: 24,
    cibilScore: 710,
    monthlyIncome: 200000,
    monthlyObligations: 45000,
    dlaId: "DLA-001",
    status: "disbursed",
    routedTo: "L002",
    routedAt: "2024-01-14T14:00:00Z",
    kfsGenerated: true,
    aaConsent: true,
    createdAt: "2024-01-14T11:30:00Z",
  },
];

async function seedLenders() {
  if (await LenderProduct.countDocuments()) {
    console.log("[seed] lenders exist — skipping");
    return;
  }
  await LenderProduct.insertMany(LENDERS);
  console.log(`[seed] inserted ${LENDERS.length} lender products`);
}

async function seedApplicationsAndRoutes() {
  if (await LoanApplication.countDocuments()) {
    console.log("[seed] applications exist — skipping");
    return;
  }

  const lenders = await LenderProduct.find();

  for (const appData of APPLICATIONS) {
    const app = await LoanApplication.create({
      ...appData,
      createdAt: new Date(appData.createdAt),
      routedAt: appData.routedAt ? new Date(appData.routedAt) : null,
    });

    if (appData.routedTo) {
      const lender = lenders.find((l) => l.id === appData.routedTo);
      const result = runCreditEngine(app.toObject(), lenders.map((l) => l.toObject()));
      const hit = result.eligible.find((e) => e.lender.id === lender.id);
      const kfsData = generateKFS(app.toObject(), lender.toObject());

      await ApplicationRoute.create({
        applicationId: app.id,
        lenderId: lender.id,
        score: hit ? hit.score : 0,
        emi: kfsData.emi,
        totalPayable: kfsData.totalPayable,
        routedAt: new Date(appData.routedAt),
        status: appData.status === "disbursed" ? "disbursed" : "pending",
        kfsData,
        rejectionReasons: [],
      });
    }

    const statement = aaService.fetchBankStatement({ pan: app.pan });
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);

    await BorrowerProfile.create({
      pan: app.pan,
      name: app.borrowerName,
      mobile: app.mobile,
      cibilScore: app.cibilScore,
      cibilPulledAt: new Date(appData.createdAt),
      aaConsentActive: true,
      aaConsentExpiry: expiry,
      bankStatementSummary: statement.summary,
      activeLoans: statement.activeLoans,
      totalExistingEmi: app.monthlyObligations,
    });
  }

  console.log(`[seed] inserted ${APPLICATIONS.length} applications, routes, and profiles`);
}

async function seedConsumerData() {
  const userIdKey = "USR-001";
  if (await CreditProfile.countDocuments({ userId: userIdKey })) {
    return;
  }

  const cp = await CreditProfile.create({
    userId: userIdKey,
    cibilScore: 750,
    monthlyIncome: 75000,
    monthlyObligations: 15000,
    dti: 0.2,
    employmentType: "salaried",
    bureauStatus: "PULLED",
    bureauLastPulledAt: new Date(),
    aaStatus: "CONNECTED",
    creditUtilization: 15,
    profileCompleteness: 85,
    lastEvaluatedAt: new Date(),
  });

  const exp1 = new Date();
  exp1.setFullYear(exp1.getFullYear() + 1);

  await ConsentRecord.create({
    id: "CNS-001",
    userId: userIdKey,
    consentType: "AA_DATA",
    purpose: "Bank statement analysis for credit assessment",
    provider: "Finvu Account Aggregator",
    status: "ACTIVE",
    version: "1.0",
    grantedAt: new Date(),
    expiresAt: exp1,
    metadata: { scope: ["BANK_ACCOUNTS", "CREDIT_INFORMATION"] },
  });

  const exp2 = new Date();
  exp2.setDate(exp2.getDate() + 30);

  const intent = await LoanIntent.create({
    id: "INT-001",
    userId: userIdKey,
    purpose: "Electronics",
    requestedAmount: 80000,
    preferredTenure: 12,
    status: "OFFERS_GENERATED",
    expiresAt: exp2,
  });

  const exp3 = new Date();
  exp3.setDate(exp3.getDate() + 14);

  await LoanOffer.create({
    id: "OFFER-001",
    loanIntentId: intent.id,
    lenderProductId: "L001",
    lenderId: "L001",
    lenderName: "CreditSaison India",
    amount: 80000,
    interestRate: 14.5,
    APR: 15.0,
    tenure: 12,
    EMI: 7200,
    processingFee: 1200,
    totalRepayment: 86400,
    disbursalTime: "T+1",
    eligibilityReasons: ["✓ Requested amount within limits", "✓ CIBIL > 650", "✓ DTI < 45%", "✓ Purpose supported"],
    status: "GENERATED",
    expiresAt: exp3,
  });

  await LoanOffer.create({
    id: "OFFER-002",
    loanIntentId: intent.id,
    lenderProductId: "L003",
    lenderId: "L003",
    lenderName: "HDFC Bank",
    amount: 80000,
    interestRate: 10.75,
    APR: 11.25,
    tenure: 12,
    EMI: 7062,
    processingFee: 800,
    totalRepayment: 84744,
    disbursalTime: "T+3",
    eligibilityReasons: ["✓ Prime borrower tier", "✓ Low leverage ratio", "✓ Pre-approved product"],
    status: "GENERATED",
    expiresAt: exp3,
  });

  // Seed DLA Partner
  await DLA.create({
    id: "DLA-001",
    name: "Vantage Native DLA",
    apiKey: "dla_live_key_9988",
    apiSecret: "sec_998877665544",
    status: "ACTIVE",
    webhookUrl: "http://localhost:5000/api/mock-dla-webhook",
  });

  // Seed DLG Portfolios
  for (const l of LENDERS) {
    await DLGPortfolio.create({
      lenderId: l.id,
      lenderProductId: l.id,
      portfolioOutstanding: 1000000,
      disbursedOutstanding: 500000,
      dlgAmount: 25000,
      dlgCap: 0.05,
      utilization: 50,
      availableCapacity: 25000,
      status: "COMPLIANT",
    });
  }

  console.log("[seed] seeded consumer credit profile, DLA partner, DLG portfolios, consent, intent, and offers");
}

async function seedUsers() {
  const users = [
    {
      username: "admin",
      password: "Admin@123",
      role: "ADMIN",
      fullName: "Platform Operations Monitor",
      email: "admin@vantagecredit.in",
      mobile: "9988776655",
      pan: "ABCDE1234F",
      kycStatus: "VERIFIED",
    },
    {
      username: "dla1",
      password: "Dla@123",
      role: "DLA",
      dlaId: "DLA-001",
      fullName: "Vantage DLA Operator",
      email: "dla@vantagecredit.in",
      mobile: "9876543200",
      pan: "DLAXX1234D",
      kycStatus: "VERIFIED",
    },
    {
      username: "lender1",
      password: "Lender@123",
      role: "LENDER",
      lenderId: "L001",
      fullName: "CreditSaison Underwriter",
      email: "underwriting@creditsaison.in",
      mobile: "9876543201",
      pan: "LNDXX1234L",
      kycStatus: "VERIFIED",
    },
    {
      username: "user1",
      password: "User@123",
      role: "USER",
      userId: "USR-001",
      fullName: "Rahul Sharma",
      email: "rahul.sharma@example.com",
      mobile: "9876543210",
      pan: "ABCPS1234D",
      monthlyIncome: 75000,
      monthlyObligations: 15000,
      profileCompletion: 85,
      kycStatus: "VERIFIED",
    },
  ];

  for (const u of users) {
    const existing = await User.findOne({ username: u.username });
    if (!existing) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await User.create({
        username: u.username,
        passwordHash,
        role: u.role,
        dlaId: u.dlaId || null,
        lenderId: u.lenderId || null,
        userId: u.userId || null,
        fullName: u.fullName,
        email: u.email,
        mobile: u.mobile,
        pan: u.pan,
        monthlyIncome: u.monthlyIncome || 0,
        monthlyObligations: u.monthlyObligations || 0,
        profileCompletion: u.profileCompletion || 100,
        kycStatus: u.kycStatus || "VERIFIED",
      });
    }
  }
  console.log("[seed] seeded default platform role users");
}

const CreditAccount = require("./models/CreditAccount");
const CreditConsumptionEvent = require("./models/CreditConsumptionEvent");
const CreditRule = require("./models/CreditRule");

async function seedCreditData() {
  const userIdKey = "USR-001";
  const existingAcc = await CreditAccount.findOne({ userId: userIdKey });
  if (!existingAcc) {
    const acc = await CreditAccount.create({
      id: "CRD-ACC-001",
      userId: userIdKey,
      lenderId: "L001",
      lenderProductId: "L001",
      creditLimit: 100000,
      availableCredit: 75000,
      utilizedCredit: 20000,
      reservedCredit: 5000,
      currency: "INR",
      status: "ACTIVE",
      version: 1,
      openedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      lastActivityAt: new Date(),
    });

    // Seed historical immutable events
    await CreditConsumptionEvent.insertMany([
      {
        id: "CRD-EVT-001",
        eventId: "CRD-EVT-001",
        idempotencyKey: "seed-grant-001",
        creditAccountId: acc.id,
        userId: userIdKey,
        eventType: "CREDIT_GRANTED",
        creditAmount: 100000,
        balanceAfter: { creditLimit: 100000, availableCredit: 100000, utilizedCredit: 0, reservedCredit: 0 },
        source: "LENDER_SYNC",
        metadata: { facilityName: "CreditSaison Prime Line", note: "Approved credit facility" },
        status: "SUCCESS",
        processedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
      {
        id: "CRD-EVT-002",
        eventId: "CRD-EVT-002",
        idempotencyKey: "seed-consume-002",
        creditAccountId: acc.id,
        userId: userIdKey,
        eventType: "CREDIT_CONSUMED",
        creditAmount: 25000,
        balanceAfter: { creditLimit: 100000, availableCredit: 75000, utilizedCredit: 25000, reservedCredit: 0 },
        source: "CONSUMER_PORTAL",
        metadata: { purpose: "electronics", merchant: "Croma Retail", item: "Smart LED TV" },
        status: "SUCCESS",
        processedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      },
      {
        id: "CRD-EVT-003",
        eventId: "CRD-EVT-003",
        idempotencyKey: "seed-repay-003",
        creditAccountId: acc.id,
        userId: userIdKey,
        eventType: "CREDIT_REPAID",
        creditAmount: 5000,
        balanceAfter: { creditLimit: 100000, availableCredit: 80000, utilizedCredit: 20000, reservedCredit: 0 },
        source: "SYSTEM",
        metadata: { paymentReference: "UPI/20240115/09876", method: "eNACH" },
        status: "SUCCESS",
        processedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        id: "CRD-EVT-004",
        eventId: "CRD-EVT-004",
        idempotencyKey: "seed-reserve-004",
        creditAccountId: acc.id,
        userId: userIdKey,
        eventType: "CREDIT_RESERVED",
        creditAmount: 5000,
        balanceAfter: { creditLimit: 100000, availableCredit: 75000, utilizedCredit: 20000, reservedCredit: 5000 },
        source: "CHECKOUT_GATEWAY",
        metadata: { purpose: "travel", merchant: "MakeMyTrip", holdDurationHours: 24 },
        status: "SUCCESS",
        processedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ]);
  }

  // Seed default CreditRule if not existing
  const existingRule = await CreditRule.findOne({ ruleId: "RULE-001" });
  if (!existingRule) {
    await CreditRule.create({
      ruleId: "RULE-001",
      ruleType: "MAX_SINGLE_TRANSACTION",
      threshold: { maxAmount: 50000 },
      action: "ALLOW",
      active: true,
      description: "Default maximum per-transaction consumption limit of ₹50,000.",
    });
  }

  // Seed demo active loan and repayment schedule if not existing
  const RepaymentSchedule = require("./models/RepaymentSchedule");
  const loanId = "APP-CRD-001";
  const existingLoan = await LoanApplication.findOne({ $or: [{ id: loanId }, { creditAccountId: "CRD-ACC-001" }] });
  if (!existingLoan) {
    await LoanApplication.create({
      id: loanId,
      borrowerName: "Demo Consumer",
      pan: "ABCPS1234D",
      mobile: "9876543210",
      amount: 20000,
      purpose: "electronics",
      tenure: 6,
      cibilScore: 750,
      monthlyIncome: 60000,
      monthlyObligations: 12000,
      dlaId: "DLA-CONSUMER",
      userId: userIdKey,
      creditAccountId: "CRD-ACC-001",
      lenderId: "L001",
      lenderProductId: "L001",
      interestRate: 14.5,
      APR: 15.0,
      emi: 3478,
      processingFee: 200,
      totalRepayment: 20868,
      disbursedAmount: 20000,
      outstandingPrincipal: 20000,
      totalPaid: 0,
      installmentsCount: 6,
      installmentsPaid: 0,
      nextDueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      disbursedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      routedTo: "L001",
      routedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      kfsGenerated: true,
      kfsAcceptedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      aaConsent: true,
    });

    const schedules = [
      { id: "SCH-CRD-0001", loanId, creditAccountId: "CRD-ACC-001", userId: userIdKey, installmentNumber: 1, dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), principalAmount: 3236, interestAmount: 242, totalAmount: 3478, paidAmount: 0, remainingAmount: 3478, status: "PENDING" },
      { id: "SCH-CRD-0002", loanId, creditAccountId: "CRD-ACC-001", userId: userIdKey, installmentNumber: 2, dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), principalAmount: 3275, interestAmount: 203, totalAmount: 3478, paidAmount: 0, remainingAmount: 3478, status: "PENDING" },
      { id: "SCH-CRD-0003", loanId, creditAccountId: "CRD-ACC-001", userId: userIdKey, installmentNumber: 3, dueDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000), principalAmount: 3315, interestAmount: 163, totalAmount: 3478, paidAmount: 0, remainingAmount: 3478, status: "PENDING" },
      { id: "SCH-CRD-0004", loanId, creditAccountId: "CRD-ACC-001", userId: userIdKey, installmentNumber: 4, dueDate: new Date(Date.now() + 105 * 24 * 60 * 60 * 1000), principalAmount: 3355, interestAmount: 123, totalAmount: 3478, paidAmount: 0, remainingAmount: 3478, status: "PENDING" },
      { id: "SCH-CRD-0005", loanId, creditAccountId: "CRD-ACC-001", userId: userIdKey, installmentNumber: 5, dueDate: new Date(Date.now() + 135 * 24 * 60 * 60 * 1000), principalAmount: 3396, interestAmount: 82, totalAmount: 3478, paidAmount: 0, remainingAmount: 3478, status: "PENDING" },
      { id: "SCH-CRD-0006", loanId, creditAccountId: "CRD-ACC-001", userId: userIdKey, installmentNumber: 6, dueDate: new Date(Date.now() + 165 * 24 * 60 * 60 * 1000), principalAmount: 3423, interestAmount: 41, totalAmount: 3464, paidAmount: 0, remainingAmount: 3464, status: "PENDING" },
    ];
    await RepaymentSchedule.insertMany(schedules).catch(() => {});
  }

  console.log("[seed] seeded consumer credit account, active loan, repayment schedule, ledger events, and rules");
}

async function seedDatabase(force = false) {
  if (force) {
    await Promise.all([
      LoanApplication.deleteMany({}),
      LenderProduct.deleteMany({}),
      ApplicationRoute.deleteMany({}),
      BorrowerProfile.deleteMany({}),
      ComplianceLog.deleteMany({}),
      CreditProfile.deleteMany({}),
      ConsentRecord.deleteMany({}),
      LoanIntent.deleteMany({}),
      LoanOffer.deleteMany({}),
      DLA.deleteMany({}),
      DLGPortfolio.deleteMany({}),
      CreditAccount.deleteMany({}),
      CreditConsumptionEvent.deleteMany({}),
      CreditRule.deleteMany({}),
    ]);
    console.log("[seed] force reseed — cleared collections");
  }
  await seedUsers();
  await seedLenders();
  await seedApplicationsAndRoutes();
  await seedConsumerData();
  await seedCreditData();
}

module.exports = { seedDatabase };
