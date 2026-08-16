const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { JWT_EXPIRES_IN } = require("../config/constants");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// POST /api/auth/login  (public)
// Body: { username, password }
// Returns: { token, user: { username, role, dlaId, lenderId } }
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    const user = await User.findOne({ username: String(username).toLowerCase() });
    if (!user || !user.active) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign(
      {
        sub: user._id.toString(),
        username: user.username,
        role: user.role,
        dlaId: user.dlaId,
        lenderId: user.lenderId,
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    return res.json({
      token,
      user: { username: user.username, role: user.role, dlaId: user.dlaId, lenderId: user.lenderId },
    });
  })
);

module.exports = router;
