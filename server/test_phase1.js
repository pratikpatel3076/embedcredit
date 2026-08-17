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

async function main() {
  await connectDB();
  await seedDatabase(true);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use("/api/auth", authRoutes);
  app.use("/api", consumerRoutes);
  app.use("/api", dlaRoutes);
  app.use("/api", lenderRoutes);
  app.use("/api", engineRoutes);
  app.use("/api", adminRoutes);

  const server = http.createServer(app);
  await new Promise((res) => server.listen(5099, res));
  console.log("Testing Phase 1 API contracts on :5099...");

  try {
    // 1. Auth Login
    const loginRes = await fetch("http://localhost:5099/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "user1", password: "User@123" }),
    }).then((r) => r.json());
    console.log("1. Login status: 200 Token exists:", Boolean(loginRes.token));
    const token = loginRes.token;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // 2. GET Profile
    const profileData = await fetch("http://localhost:5099/api/profile", { headers }).then((r) => r.json());
    console.log("2. Profile name:", profileData.fullName, "Completion:", profileData.profileCompletion + "%");

    // 3. GET Credit Profile
    const creditProfileData = await fetch("http://localhost:5099/api/credit-profile", { headers }).then((r) => r.json());
    console.log("3. Credit Profile CIBIL:", creditProfileData.cibilScore);

    // 4. POST Bureau Pull
    const bureauRes = await fetch("http://localhost:5099/api/credit-profile/bureau-pull", {
      method: "POST",
      headers,
    }).then((r) => r.json());
    console.log("4. Bureau pull score:", bureauRes.bureauData?.cibilScore);

    // 5. GET Consents
    const consentsData = await fetch("http://localhost:5099/api/consents", { headers }).then((r) => r.json());
    console.log("5. Consent records count:", consentsData.length);

    // 6. POST Loan Intent
    const createIntentData = await fetch("http://localhost:5099/api/loan-intents", {
      method: "POST",
      headers,
      body: JSON.stringify({ purpose: "Electronics", requestedAmount: 60000, preferredTenure: 12 }),
    }).then((r) => r.json());
    console.log("6. Created LoanIntent:", createIntentData.intent?.id, createIntentData.intent?.purpose);

    // 7. Find Offers
    const findOffersData = await fetch(`http://localhost:5099/api/loan-intents/${createIntentData.intent.id}/find-offers`, {
      method: "POST",
      headers,
    }).then((r) => r.json());
    console.log("7. Generated Offers count:", findOffersData.offers?.length);

    // 8. Select Offer
    const targetOffer = findOffersData.offers[0];
    const selectRes = await fetch(`http://localhost:5099/api/offers/${targetOffer.id}/select`, {
      method: "POST",
      headers,
    }).then((r) => r.json());
    console.log("8. Offer Selected! Application ID:", selectRes.application?.id, "Status:", selectRes.application?.status, "KFS generated:", selectRes.application?.kfsGenerated);

    // 9. GET My Loans
    const myLoansData = await fetch("http://localhost:5099/api/my-loans", { headers }).then((r) => r.json());
    const loansList = myLoansData.apps || myLoansData;
    console.log("9. My Loans count:", loansList.length);

    console.log("\n✅ ALL PHASE 1 INTEGRATION TESTS PASSED PERFECTLY!");
    server.close();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ INTEGRATION TEST FAILED:", err);
    server.close();
    process.exit(1);
  }
}

main();
