const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const CreditProfile = require("../models/CreditProfile");
const { authenticate } = require("../middleware/auth");
const { JWT_EXPIRES_IN } = require("../config/constants");
const asyncHandler = require("../utils/asyncHandler");
const { nextUserId } = require("../utils/idGenerator");
const { logCompliance } = require("../middleware/rbiCompliance");

const router = express.Router();

function signToken(user) {
  const secret = process.env.JWT_SECRET || "vantage_credit_secret_key_2026";
  const payload = {
    sub: user._id.toString(),
    username: user.username,
    role: user.role,
    dlaId: user.dlaId || null,
    lenderId: user.lenderId || (user.username === "lender1" ? "L001" : null),
    userId: user.userId || null,
  };
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
}

// POST /api/auth/register (Consumer self-registration)
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { username, password, fullName, email, mobile, pan } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const userIdKey = await nextUserId();
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: username.toLowerCase(),
      passwordHash,
      role: "USER",
      userId: userIdKey,
      fullName: fullName || username,
      email: email || "",
      mobile: mobile || "",
      pan: pan ? pan.toUpperCase() : "",
      monthlyIncome: 60000,
      monthlyObligations: 12000,
      profileCompletion: 60,
      kycStatus: "VERIFIED",
    });

    await CreditProfile.create({
      userId: userIdKey,
      cibilScore: 740,
      monthlyIncome: 60000,
      monthlyObligations: 12000,
      dti: 0.2,
      bureauStatus: "PULLED",
      bureauLastPulledAt: new Date(),
      aaStatus: "CONNECTED",
      profileCompleteness: 60,
    });

    await logCompliance({
      type: "USER_REGISTERED",
      userId: userIdKey,
      actor: user.username,
      actorRole: "USER",
      pass: true,
      details: { userId: userIdKey },
    });

    const token = signToken(user);
    return res.status(201).json({ token, user, message: "User registered successfully" });
  })
);

// POST /api/auth/login
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password required" });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (user.username === "lender1" && user.lenderId !== "L001") {
      user.lenderId = "L001";
      await user.save();
    }

    const token = signToken(user);
    return res.json({ token, user });
  })
);

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
