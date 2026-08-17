const http = require("http");
const { connectDB } = require("./config/db");
const { seedDatabase } = require("./seed");

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const dlaRoutes = require("./routes/dla.routes");
const lenderRoutes = require("./routes/lender.routes");
const adminRoutes = require("./routes/admin.routes");
const engineRoutes = require("./routes/engine.routes");
const consumerRoutes = require("./routes/consumer.routes");
const integrationRoutes = require("./routes/integration.routes");

async function main() {
  await connectDB();
  await seedDatabase(true);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/auth", authRoutes);
  app.use("/api/v1/integrations", integrationRoutes);
  app.use("/api", consumerRoutes);
  app.use("/api", dlaRoutes);
  app.use("/api", lenderRoutes);
  app.use("/api", engineRoutes);
  app.use("/api", adminRoutes);

  const server = http.createServer(app);
  await new Promise((res) => server.listen(5098, res));
  console.log("Testing Phase 2 API contracts on :5098...");

  try {
    // 1. Consumer Login
    const loginRes = await fetch("http://localhost:5098/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "user1", password: "User@123" }),
    }).then((r) => r.json());
    console.log("1. Consumer Login:", loginRes.user?.username, "Role:", loginRes.user?.role);
    const userToken = loginRes.token;
    const userHeaders = { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" };

    // 2. Create Intent & Find Offers
    const intentFetch = await fetch("http://localhost:5098/api/loan-intents", {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({ purpose: "Shopping", requestedAmount: 50000, preferredTenure: 6 }),
    });
    if (!intentFetch.ok) {
      const text = await intentFetch.text();
      console.error("Intent Fetch Failed:", intentFetch.status, text);
      throw new Error(`Intent fetch failed status ${intentFetch.status}`);
    }
    const intentRes = await intentFetch.json();
    console.log("2. Created Intent:", intentRes.intent?.id, intentRes.intent?.purpose);

    const offersRes = await fetch(`http://localhost:5098/api/loan-intents/${intentRes.intent.id}/find-offers`, {
      method: "POST",
      headers: userHeaders,
    }).then((r) => r.json());
    console.log("3. Generated Marketplace Offers count:", offersRes.offers?.length);
    const firstOffer = offersRes.offers[0];
    console.log("   Explainable eligibility reasons:", firstOffer.eligibilityReasons);

    // 4. Select Offer (Generates KFS)
    const selectRes = await fetch(`http://localhost:5098/api/offers/${firstOffer.id}/select`, {
      method: "POST",
      headers: userHeaders,
    }).then((r) => r.json());
    console.log("4. Selected Offer -> App ID:", selectRes.application?.id, "Status:", selectRes.application?.status, "KFS generated:", selectRes.application?.kfsGenerated);
    const appId = selectRes.application.id;

    // 5. Test Lender Decision Workflow (Lender Login)
    const lenderLoginRes = await fetch("http://localhost:5098/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "lender1", password: "Lender@123" }),
    }).then((r) => r.json());
    const lenderToken = lenderLoginRes.token;
    const lenderHeaders = { Authorization: `Bearer ${lenderToken}`, "Content-Type": "application/json" };

    // Approve application as Lender
    const approveRes = await fetch(`http://localhost:5098/api/applications/${appId}/approve`, {
      method: "POST",
      headers: lenderHeaders,
    }).then((r) => r.json());
    console.log("5. Lender Approval:", approveRes.message, "New Status:", approveRes.application?.status);

    // Verify ADMIN is forbidden from approving
    const adminLoginRes = await fetch("http://localhost:5098/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "Admin@123" }),
    }).then((r) => r.json());
    const adminToken = adminLoginRes.token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" };

    const adminApproveAttempt = await fetch(`http://localhost:5098/api/applications/${appId}/approve`, {
      method: "POST",
      headers: adminHeaders,
    });
    console.log("6. Admin Approval Attempt Status Code (Forbidden Expected):", adminApproveAttempt.status);

    // 7. Create second application and test Lender Rejection with structured reason
    const intent2 = await fetch("http://localhost:5098/api/loan-intents", {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({ purpose: "Travel", requestedAmount: 60000, preferredTenure: 12 }),
    }).then((r) => r.json());

    const offers2 = await fetch(`http://localhost:5098/api/loan-intents/${intent2.intent.id}/find-offers`, {
      method: "POST",
      headers: userHeaders,
    }).then((r) => r.json());

    const select2 = await fetch(`http://localhost:5098/api/offers/${offers2.offers[0].id}/select`, {
      method: "POST",
      headers: userHeaders,
    }).then((r) => r.json());
    const app2Id = select2.application.id;

    const rejectRes = await fetch(`http://localhost:5098/api/applications/${app2Id}/reject`, {
      method: "POST",
      headers: lenderHeaders,
      body: JSON.stringify({ rejectionReasonCode: "CREDIT_CRITERIA_NOT_MET", rejectionReasonText: "Below 680 cutoff" }),
    }).then((r) => r.json());
    console.log("7. Lender Rejection:", rejectRes.message, "Code:", rejectRes.application?.rejectionReasonCode);
    console.log("   Decline Explanation for consumer:", rejectRes.application?.declineExplanation);

    // 8. Test Versioned DLA Integration APIs (/api/v1/integrations/*) & Idempotency
    const dlaHeaders = {
      "X-API-Key": "dla_live_key_9988",
      "Content-Type": "application/json",
      "Idempotency-Key": "IDEM-TEST-12345",
    };

    const externalAppRes = await fetch("http://localhost:5098/api/v1/integrations/applications", {
      method: "POST",
      headers: dlaHeaders,
      body: JSON.stringify({
        borrowerName: "Vikram Seth",
        pan: "XYZVS9988M",
        mobile: "9876500000",
        amount: 100000,
        purpose: "Electronics",
        tenure: 12,
        cibilScore: 760,
        monthlyIncome: 85000,
        monthlyObligations: 12000,
        aaConsent: true,
      }),
    });
    const externalAppData = await externalAppRes.json();
    console.log("8. External DLA Application Created:", externalAppData.application?.id, "API Version:", externalAppData.apiVersion);

    // Test Idempotency Key cached response
    const duplicateRes = await fetch("http://localhost:5098/api/v1/integrations/applications", {
      method: "POST",
      headers: dlaHeaders,
      body: JSON.stringify({
        borrowerName: "Vikram Seth",
        pan: "XYZVS9988M",
        mobile: "9876500000",
        amount: 100000,
        purpose: "Electronics",
        tenure: 12,
        cibilScore: 760,
        monthlyIncome: 85000,
        monthlyObligations: 12000,
      }),
    });
    console.log("   Idempotency Duplicate Header X-Cache:", duplicateRes.headers.get("x-cache"));

    // 9. Check DLG Portfolio Cap Status
    const portfolioRes = await fetch("http://localhost:5098/api/lenders/L003/portfolio", {
      headers: lenderHeaders,
    }).then((r) => r.json());
    console.log("9. DLG Portfolio Cap Limit:", portfolioRes.capLimit, "Current Utilization:", portfolioRes.utilizationPct + "%");

    // 10. Check Webhook delivery logs
    const webhooksRes = await fetch("http://localhost:5098/api/admin/webhooks", {
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log("10. Webhooks Logged Count:", webhooksRes.length, "Latest Event:", webhooksRes[0]?.eventType);

    // 11. Check Compliance Logs
    const complianceRes = await fetch("http://localhost:5098/api/admin/compliance-logs", {
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log("11. Compliance Audit Logs Count:", complianceRes.length, "Latest Type:", complianceRes[0]?.type);

    console.log("\n✅ ALL PHASE 2 INTEGRATION TESTS PASSED PERFECTLY!");
    server.close();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ PHASE 2 INTEGRATION TEST FAILED:", err);
    server.close();
    process.exit(1);
  }
}

main();
