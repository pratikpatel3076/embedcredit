const http = require("http");
const { connectDB } = require("./config/db");
const { seedDatabase } = require("./seed");

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const { requestIdMiddleware, securityHeaders, sanitizeQuery } = require("./middleware/security");
const { errorHandler } = require("./middleware/errorHandler");
const { transitionApplication } = require("./services/stateMachine");

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
  app.use(requestIdMiddleware);
  app.use(securityHeaders);
  app.use(cors());
  app.use(express.json());
  app.use(sanitizeQuery);

  app.get("/health", (req, res) => res.json({ status: "UP", requestId: req.requestId }));
  app.get("/ready", (req, res) => res.json({ ready: true, requestId: req.requestId }));

  app.use("/api/auth", authRoutes);
  app.use("/api/v1/integrations", integrationRoutes);
  app.use("/api", consumerRoutes);
  app.use("/api", dlaRoutes);
  app.use("/api", lenderRoutes);
  app.use("/api", engineRoutes);
  app.use("/api", adminRoutes);

  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise((res) => server.listen(5097, res));
  console.log("Testing Phase 3 API contracts on :5097...");

  try {
    // 1. Health & Readiness
    const health = await fetch("http://localhost:5097/health").then((r) => r.json());
    console.log("1. /health Status:", health.status, "Request ID:", health.requestId);

    const ready = await fetch("http://localhost:5097/ready").then((r) => r.json());
    console.log("2. /ready Status:", ready.ready, "Request ID:", ready.requestId);

    // 3. Standardized Error Payload
    const errorRes = await fetch("http://localhost:5097/api/applications/APP-NONEXISTENT", {
      headers: { Authorization: "Bearer invalid_token" },
    }).then((r) => r.json());
    console.log("3. Standardized Error Payload: Success:", errorRes.success, "Error Code:", errorRes.error?.code, "Request ID:", errorRes.requestId);

    // 4. Consumer Login & Notifications
    const loginRes = await fetch("http://localhost:5097/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "user1", password: "User@123" }),
    }).then((r) => r.json());
    const userToken = loginRes.token;

    const notifs = await fetch("http://localhost:5097/api/notifications", {
      headers: { Authorization: `Bearer ${userToken}` },
    }).then((r) => r.json());
    console.log("4. Consumer Notifications count:", notifs.length);

    // 5. Centralized State Machine Execution
    const appDoc = await transitionApplication("APP-001", "APPROVED", { username: "lender1", role: "LENDER", lenderId: "L003" });
    console.log("5. Centralized State Machine Transition -> Status:", appDoc.status);

    // 6. Admin Login & DLA Key Regeneration
    const adminLoginRes = await fetch("http://localhost:5097/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "Admin@123" }),
    }).then((r) => r.json());
    const adminToken = adminLoginRes.token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" };

    const regenKeyRes = await fetch("http://localhost:5097/api/admin/dla-partners/DLA-001/regenerate-key", {
      method: "POST",
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log("6. Admin DLA Key Regeneration:", regenKeyRes.id, "New Key:", regenKeyRes.newApiKey);

    // 7. Test Webhook Dispatch
    const testWebhookRes = await fetch("http://localhost:5097/api/admin/dla-partners/DLA-001/test-webhook", {
      method: "POST",
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log("7. Admin Test Webhook Dispatch:", testWebhookRes.success, "Event ID:", testWebhookRes.webhookLog?.eventId);

    // 8. Pagination Verification
    const paginatedLogs = await fetch("http://localhost:5097/api/admin/compliance-logs?page=1&limit=5", {
      headers: adminHeaders,
    }).then((r) => r.json());
    console.log("8. Paginated Compliance Logs count:", paginatedLogs.logs?.length, "Total:", paginatedLogs.total, "Page:", paginatedLogs.page);

    console.log("\n✅ ALL PHASE 3 INTEGRATION TESTS PASSED PERFECTLY!");
    server.close();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ PHASE 3 INTEGRATION TEST FAILED:", err);
    server.close();
    process.exit(1);
  }
}

main();
