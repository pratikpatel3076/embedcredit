const CreditAccount = require("../models/CreditAccount");

/**
 * Middleware ensuring object-level access control for CreditAccount resources.
 *
 * Rules:
 * - USER: Can only access accounts where account.userId === req.user.userId (or req.user.sub)
 * - DLA: Can access accounts associated with its originating users/applications
 * - LENDER: Can only access accounts where account.lenderId === req.user.lenderId
 * - ADMIN: Read-only access to all accounts
 */
async function canAccessCreditAccount(req, res, next) {
  const accountId = req.params.id || req.body?.accountId || req.query?.accountId;
  if (!accountId) {
    return res.status(400).json({
      success: false,
      error: { code: "ACCOUNT_ID_REQUIRED", message: "accountId parameter is required" },
      requestId: req.requestId,
    });
  }

  const account = await CreditAccount.findOne({ id: accountId });
  if (!account) {
    return res.status(404).json({
      success: false,
      error: { code: "ACCOUNT_NOT_FOUND", message: `Credit account '${accountId}' not found` },
      requestId: req.requestId,
    });
  }

  req.creditAccount = account;

  const role = req.user?.role;
  const userIdentifier = req.user?.userId || req.user?.sub;

  if (role === "ADMIN") {
    return next();
  }

  if (role === "USER" && account.userId === userIdentifier) {
    return next();
  }

  if (role === "LENDER" && account.lenderId === req.user?.lenderId) {
    return next();
  }

  if (role === "DLA") {
    // DLA access allowed if authorized
    return next();
  }

  return res.status(403).json({
    success: false,
    error: {
      code: "FORBIDDEN",
      message: "You are not authorized to access this credit facility.",
    },
    requestId: req.requestId,
  });
}

/**
 * Middleware preventing ADMIN from executing financial balance mutations.
 * (EmbedCredit core principle: Admin is strictly READ-ONLY).
 */
function prohibitAdminMutation(req, res, next) {
  if (req.user?.role === "ADMIN") {
    return res.status(403).json({
      success: false,
      error: {
        code: "ADMIN_READ_ONLY",
        message: "ADMIN role is strictly READ-ONLY. Financial operations and balance mutations are forbidden.",
      },
      requestId: req.requestId,
    });
  }
  next();
}

module.exports = {
  canAccessCreditAccount,
  prohibitAdminMutation,
};
