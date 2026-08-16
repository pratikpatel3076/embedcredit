// ── Seed script ──────────────────────────────────────────────────
// Seeds the 4 lender products, 3 sample applications + their routes, and
// borrower profiles — matching the frontend mock data exactly.
// Idempotent by default: skips a collection if it already has documents.
// `force` (npm run seed) drops and reseeds.
const LenderProduct = require("./models/LenderProduct");
const LoanApplication = require("./models/LoanApplication");
const ApplicationRoute = require("./models/ApplicationRoute");
const BorrowerProfile = require("./models/BorrowerProfile");
const ComplianceLog = require("./models/ComplianceLog");
const { runCreditEngine } = require("./services/creditEngine");
const { generateKFS } = require("./services/kfsGenerator");
const aaService = require("./services/aaService");

// Same 4 lender products as the frontend LENDER_PRODUCTS, plus the
// OCEN / AA / NACH flags from the Lenders page.
const LENDERS = [
  {
    id: "L001",
    lenderName: "CreditSaison India",
    type: "NBFC",
    minAmount: 10000,
    maxAmount: 500000,
    interestRate: 14.5,
    tenureMonths: [3, 6, 12, 18],
    minCibilScore: 650,
    maxDti: 0.45,
    processingFee: 1.5,
    disbursalTime: "T+1",
    supportedPurposes: ["personal", "consumer", "education"],
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
    tenureMonths: [12, 24, 36, 48, 60],
    minCibilScore: 720,
    maxDti: 0.4,
    processingFee: 1.0,
    disbursalTime: "T+3",
    supportedPurposes: ["personal", "consumer", "medical"],
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
    tenureMonths: [3, 6, 9, 12],
    minCibilScore: 620,
    maxDti: 0.55,
    processingFee: 2.5,
    disbursalTime: "T+0",
    supportedPurposes: ["personal", "consumer", "emergency"],
    ocenEnabled: false,
    aaEnabled: false,
    nachEnabled: true,
  },
];

// Same 3 sample applications as the frontend INITIAL_APPLICATIONS.
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
    status: "routed",
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

async function seedDatabase(force = false) {
  if (force) {
    await Promise.all([
      LoanApplication.deleteMany({}),
      LenderProduct.deleteMany({}),
      ApplicationRoute.deleteMany({}),
      BorrowerProfile.deleteMany({}),
      ComplianceLog.deleteMany({}),
    ]);
    console.log("[seed] force reseed — cleared collections");
  }
  await seedLenders();
  await seedApplicationsAndRoutes();
}

module.exports = { seedDatabase };
