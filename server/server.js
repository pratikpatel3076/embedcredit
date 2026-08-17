require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const { connectDB } = require("./config/db");
const { seedDatabase } = require("./seed");
const { requestIdMiddleware, securityHeaders, sanitizeQuery } = require("./middleware/security");
const { errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth.routes");
const dlaRoutes = require("./routes/dla.routes");
const lenderRoutes = require("./routes/lender.routes");
const adminRoutes = require("./routes/admin.routes");
const engineRoutes = require("./routes/engine.routes");
const consumerRoutes = require("./routes/consumer.routes");
const integrationRoutes = require("./routes/integration.routes");

const app = express();

app.use(requestIdMiddleware);
app.use(securityHeaders);
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());
app.use(sanitizeQuery);

// Health & Readiness Endpoints
app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    service: "vantage-credit-api",
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
});

app.get("/ready", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const isReady = dbState === 1; // 1 = connected
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    database: isReady ? "CONNECTED" : "DISCONNECTED",
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "vantage-credit-api", time: new Date().toISOString(), requestId: req.requestId });
});

// Mock DLA Webhook Endpoint
app.post("/api/mock-dla-webhook", (req, res) => {
  res.json({ received: true, eventId: req.body?.eventId, requestId: req.requestId });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/v1/integrations", integrationRoutes);
app.use("/api", consumerRoutes);
app.use("/api", dlaRoutes);
app.use("/api", lenderRoutes);
app.use("/api", engineRoutes);
app.use("/api", adminRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Resource endpoint not found" },
    requestId: req.requestId,
  });
});

// Centralized Error Handler
app.use(errorHandler);

let server;
(async () => {
  await connectDB();
  if (process.env.SEED_ON_BOOT !== "false") {
    await seedDatabase(false);
  }
  const port = process.env.PORT || 5000;
  server = app.listen(port, () => {
    console.log(`[server] Vantage Credit API listening on :${port}`);
  });
})();

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM signal received: closing HTTP server");
  if (server) {
    server.close(() => {
      console.log("[server] HTTP server closed");
      mongoose.connection.close(false, () => {
        process.exit(0);
      });
    });
  }
});
