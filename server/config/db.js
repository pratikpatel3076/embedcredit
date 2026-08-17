const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

// Seeds the platform users (one per role) on boot.
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
    {
      username: process.env.SEED_USER_USERNAME || "user1",
      password: process.env.SEED_USER_PASSWORD || "User@123",
      role: "USER",
      userId: "USR-001",
      fullName: "Arjun Verma",
      email: "arjun.verma@example.com",
      mobile: "9876543210",
      pan: "ABCPS1234D",
      monthlyIncome: 75000,
      monthlyObligations: 15000,
      profileCompletion: 85,
      kycStatus: "VERIFIED",
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
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    console.log("[db] connected to MongoDB:", uri);
  } catch (err) {
    console.log("[db] local MongoDB not reachable, starting mongodb-memory-server...");
    const { MongoMemoryServer } = require("mongodb-memory-server");
    const mongod = await MongoMemoryServer.create();
    const memUri = mongod.getUri();
    await mongoose.connect(memUri);
    console.log("[db] connected to in-memory MongoDB:", memUri);
  }
  await seedUsers();
  return mongoose.connection;
}

module.exports = { connectDB, seedUsers };
