require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { connectDB } = require("./config/db");
const { seedDatabase } = require("./seed");

const authRoutes = require("./routes/auth.routes");
const dlaRoutes = require("./routes/dla.routes");
const lenderRoutes = require("./routes/lender.routes");
const adminRoutes = require("./routes/admin.routes");
const engineRoutes = require("./routes/engine.routes");

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "vantage-credit-api", time: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", dlaRoutes); // POST/GET applications, bureau, aa
app.use("/api", lenderRoutes); // lenders, portfolio, disburse
app.use("/api", engineRoutes); // run-engine, route
app.use("/api", adminRoutes); // admin stats/compliance, POST lenders

// 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[error]", err.message);
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: "Validation failed", errors: err.errors });
  }
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

(async () => {
  await connectDB();
  if (process.env.SEED_ON_BOOT !== "false") {
    await seedDatabase(false);
  }
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`[server] Vantage Credit API listening on :${port}`);
  });
})();
