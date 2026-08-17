const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { canAccessCreditAccount, prohibitAdminMutation } = require("../middleware/creditAuthorization");
const asyncHandler = require("../utils/asyncHandler");
const creditController = require("../controllers/credit.controller");

const router = express.Router();

// Apply authentication to all credit endpoints
router.use(authenticate);

// Account Queries
router.get("/account", asyncHandler(creditController.getAccount));
router.get("/account/:id", canAccessCreditAccount, asyncHandler(creditController.getAccountById));
router.get("/balance", asyncHandler(creditController.getBalance));
router.get("/events", asyncHandler(creditController.getEvents));
router.get("/analytics", asyncHandler(creditController.getAnalytics));
router.get("/rules", asyncHandler(creditController.getRules));

// Pre-flight check (All roles)
router.post("/check", asyncHandler(creditController.checkCredit));

// Mutating operations — Prohibit ADMIN (Admin is strictly read-only)
router.post("/facilities/:id/drawdown", prohibitAdminMutation, canAccessCreditAccount, asyncHandler(creditController.drawdown));
router.post("/drawdown", prohibitAdminMutation, asyncHandler(creditController.drawdown));
router.post("/reserve", prohibitAdminMutation, asyncHandler(creditController.reserve));
router.post("/consume", prohibitAdminMutation, asyncHandler(creditController.consume));
router.post("/release", prohibitAdminMutation, asyncHandler(creditController.release));

// Repayments and Reversals — Restricted to LENDER or DLA / authorized workflows (Admin forbidden)
router.post("/repayment", prohibitAdminMutation, requireRole("LENDER", "DLA", "USER"), asyncHandler(creditController.repayment));
router.post("/reversal", prohibitAdminMutation, requireRole("LENDER", "DLA"), asyncHandler(creditController.reversal));

module.exports = router;
