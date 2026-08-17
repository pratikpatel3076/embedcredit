// ── Credit Engine & Marketplace Matching Service ──

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
  score -= (lender.interestRate || 12) * 2;
  score += (1 - dti) * 20;
  if (app.cibilScore > 750) score += 10;
  if (lender.disbursalTime === "T+0") score += 5;
  if (lender.disbursalTime === "T+1") score += 3;
  return Math.round(score);
}

function runCreditEngine(application, lenders) {
  const amount = Number(application.amount || application.requestedAmount) || 0;
  const tenure = Number(application.tenure || application.preferredTenure) || 0;
  const purpose = String(application.purpose || "").toLowerCase();
  const cibilScore = Number(application.cibilScore) || 0;
  const income = Number(application.monthlyIncome) || 1;
  const obligations = Number(application.monthlyObligations) || 0;
  const dti = obligations / income;
  const eligible = [];
  const rejected = [];

  for (const lender of lenders) {
    const reasons = [];
    const eligibleReasons = [];
    let pass = true;

    if (amount < lender.minAmount) {
      reasons.push(`Requested amount ₹${amount.toLocaleString("en-IN")} below product minimum ₹${lender.minAmount.toLocaleString("en-IN")}`);
      pass = false;
    } else {
      eligibleReasons.push(`✓ Requested amount ₹${amount.toLocaleString("en-IN")} within product limits (₹${lender.minAmount.toLocaleString("en-IN")} - ₹${lender.maxAmount.toLocaleString("en-IN")})`);
    }

    if (amount > lender.maxAmount) {
      reasons.push(`Requested amount exceeds product maximum ₹${lender.maxAmount.toLocaleString("en-IN")}`);
      pass = false;
    }

    if (cibilScore < lender.minCibilScore) {
      reasons.push(`CIBIL score ${cibilScore} below required minimum ${lender.minCibilScore}`);
      pass = false;
    } else {
      eligibleReasons.push(`✓ CIBIL requirement satisfied (${cibilScore} >= ${lender.minCibilScore})`);
    }

    if (dti > lender.maxDti) {
      reasons.push(`Debt-to-Income ratio ${(dti * 100).toFixed(1)}% exceeds max ${(lender.maxDti * 100).toFixed(0)}%`);
      pass = false;
    } else {
      eligibleReasons.push(`✓ DTI within configured limit (${(dti * 100).toFixed(1)}% <= ${(lender.maxDti * 100).toFixed(0)}%)`);
    }

    const supportedPurposesLower = (lender.supportedPurposes || []).map((p) => p.toLowerCase());
    const isPurposeSupported =
      supportedPurposesLower.includes(purpose) ||
      supportedPurposesLower.includes("personal") ||
      supportedPurposesLower.includes("consumer") ||
      purpose === "other";

    if (!isPurposeSupported) {
      reasons.push(`Requested purpose '${application.purpose}' not supported by lender`);
      pass = false;
    } else {
      eligibleReasons.push(`✓ Loan purpose '${application.purpose}' supported`);
    }

    if (!lender.tenureMonths.includes(tenure)) {
      reasons.push(`Requested tenure ${tenure}M not offered by lender`);
      pass = false;
    } else {
      eligibleReasons.push(`✓ Requested tenure ${tenure} months supported`);
    }

    const emi = calculateEMI(amount, lender.interestRate, tenure);
    const score = scoreLender(lender, { cibilScore }, dti);

    if (pass) {
      const apr = lender.APR || lender.interestRate + 0.5;
      const processingFeeAmt = Math.round((amount * (lender.processingFee || 0)) / 100);
      const totalRepayment = emi * tenure;
      eligible.push({
        lender,
        emi,
        score,
        apr,
        processingFee: processingFeeAmt,
        totalRepayment,
        reasons: eligibleReasons,
      });
    } else {
      rejected.push({ lender, emi: null, score: 0, reasons });
    }
  }

  eligible.sort((a, b) => b.score - a.score);
  return { eligible, rejected, dti };
}

function matchMarketplaceOffers(intent, creditProfile, user, lenders) {
  const appObj = {
    amount: intent.requestedAmount,
    tenure: intent.preferredTenure,
    purpose: intent.purpose,
    cibilScore: creditProfile.cibilScore || 740,
    monthlyIncome: creditProfile.monthlyIncome || user.monthlyIncome || 50000,
    monthlyObligations: creditProfile.monthlyObligations || user.monthlyObligations || 10000,
  };
  const res = runCreditEngine(appObj, lenders);
  return {
    eligibleProducts: res.eligible,
    ineligibleProducts: res.rejected,
    dti: res.dti,
  };
}

module.exports = { runCreditEngine, matchMarketplaceOffers, calculateEMI, scoreLender };
