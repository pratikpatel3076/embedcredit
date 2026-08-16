// ── KFS Generator (ported 1:1 from the frontend generateKFS) ────
// Produces the RBI-mandated Key Fact Statement snapshot for a route.
const { calculateEMI } = require("./creditEngine");

function generateKFS(app, lender) {
  const emi = calculateEMI(app.amount, lender.interestRate, app.tenure);
  const totalPayable = emi * app.tenure;
  const totalInterest = totalPayable - app.amount;
  const processingFeeAmt = Math.round((app.amount * lender.processingFee) / 100);

  return {
    lenderName: lender.lenderName,
    lenderType: lender.type,
    borrowerName: app.borrowerName,
    loanAmount: app.amount,
    interestRate: lender.interestRate,
    annualPercentageRate: lender.interestRate + 0.5,
    tenure: app.tenure,
    emi,
    totalPayable,
    totalInterest,
    processingFee: processingFeeAmt,
    disbursalTime: lender.disbursalTime,
    prepaymentCharges: "2% after 6 months, Nil after 12 months",
    penal: "2% per month on overdue",
    generatedAt: new Date().toISOString(),
    rbiCompliant: true,
  };
}

module.exports = { generateKFS };
