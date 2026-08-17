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
    ]);
    console.log("[seed] force reseed — cleared collections");
  }
  await seedLenders();
  await seedApplicationsAndRoutes();
  await seedConsumerData();
}

module.exports = { seedDatabase };
