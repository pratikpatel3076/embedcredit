const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

// Seeds the three platform users (one per role) on boot.
// Credentials come from .env (see .env.example). Idempotent — upserts only missing users.
async function seedUsers() {
  const defaults = [
    {
      username: process.env.SEED_ADMIN_USERNAME || "admin",
      password: process.env.SEED_ADMIN_PASSWORD || "Admin@123",
      role: "ADMIN",
    },
    {
      username: process.env.SEED_DLA_USERNAME || "dla1",
      password: process.env.SEED_DLA_PASSWORD || "Dla@123",
      role: "DLA",
      dlaId: "DLA-001",
    },
    {
      username: process.env.SEED_LENDER_USERNAME || "lender1",
      password: process.env.SEED_LENDER_PASSWORD || "Lender@123",
      role: "LENDER",
      lenderId: process.env.SEED_LENDER_LENDER_ID || "L003",
    },
  ];

  for (const d of defaults) {
    const exists = await User.findOne({ username: d.username });
    if (exists) continue;
    const passwordHash = await bcrypt.hash(d.password, 10);
    const { password, ...rest } = d;
    await User.create({ ...rest, passwordHash });
    console.log(`[db] seeded user "${d.username}" (${d.role})`);
  }
}

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/vantage_credit";
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log("[db] connected:", uri);
  await seedUsers();
  return mongoose.connection;
}

module.exports = { connectDB, seedUsers };
