// ── Credit Engine (ported 1:1 from the frontend runCreditEngine) ──
// Mirrors embedded-credit-marketplace.jsx exactly: same checks, same
// rejection message strings, same scoring, same EMI formula.

function calculateEMI(principal, ratePA, months) {
  const r = ratePA / 12 / 100;
  if (r === 0 || months === 0) {
    return months > 0 ? Math.round(principal / months) : 0;
  }
  return Math.round(
    (principal * r * Math.pow(1 + r, months)) /
      (Math.pow(1 + r, months) - 1)
  );
}

function scoreLender(lender, app, dti) {
  let score = 100;
  score -= lender.interestRate * 2;
  score += (1 - dti) * 20;
  if (app.cibilScore > 750) score += 10;
  if (lender.disbursalTime === "T+0") score += 5;
  if (lender.disbursalTime === "T+1") score += 3;
  return Math.round(score);
}

// application: plain object with amount, cibilScore, monthlyIncome,
//              monthlyObligations, purpose, tenure (same shape as frontend mock)
// lenders:     plain array of lender product objects
// Returns:     { eligible: [{lender, emi, score, reasons:[]}],
//                rejected: [{lender, emi:null, score:0, reasons:[...]}],
//                dti: Number }
function runCreditEngine(application, lenders) {
  const income = Number(application.monthlyIncome) || 1;
  const obligations = Number(application.monthlyObligations) || 0;
  const dti = obligations / income;
  const eligible = [];
  const rejected = [];

  for (const lender of lenders) {
    const reasons = [];
    let pass = true;

    if (application.amount < lender.minAmount) {
      reasons.push(
        `Amount ₹${application.amount.toLocaleString("en-IN")} below minimum ₹${lender.minAmount.toLocaleString("en-IN")}`
      );
      pass = false;
    }
    if (application.amount > lender.maxAmount) {
      reasons.push(
        `Amount exceeds max ₹${lender.maxAmount.toLocaleString("en-IN")}`
      );
      pass = false;
    }
    if (application.cibilScore < lender.minCibilScore) {
      reasons.push(
        `CIBIL ${application.cibilScore} below required ${lender.minCibilScore}`
      );
      pass = false;
    }
    if (dti > lender.maxDti) {
      reasons.push(
        `DTI ${(dti * 100).toFixed(1)}% exceeds max ${(lender.maxDti * 100).toFixed(0)}%`
      );
      pass = false;
    }
    if (!lender.supportedPurposes.includes(application.purpose)) {
      reasons.push(`Purpose '${application.purpose}' not supported`);
      pass = false;
    }
    if (!lender.tenureMonths.includes(application.tenure)) {
      reasons.push(`Tenure ${application.tenure}M not offered`);
      pass = false;
    }

    const emi = calculateEMI(application.amount, lender.interestRate, application.tenure);
    const score = scoreLender(lender, application, dti);

    if (pass) {
      eligible.push({ lender, emi, score, reasons: [] });
    } else {
      rejected.push({ lender, emi: null, score: 0, reasons });
    }
  }

  eligible.sort((a, b) => b.score - a.score);
  return { eligible, rejected, dti };
}

module.exports = { runCreditEngine, calculateEMI, scoreLender };
