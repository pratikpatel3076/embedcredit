// ── Bureau Service (MOCK) ─────────────────────────────────────────
// Deterministic pseudo-CIBIL score derived from PAN so the same PAN
// always returns the same score (range 300-900).

function hashPan(pan) {
  let h = 0;
  for (const c of pan) {
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
  }
  return h;
}

// MOCK ONLY. In production replace the body of this function with a real
// bureau API call, e.g. CRIF Highmark / CIBIL / Experian web service:
//   POST https://api.bureau.example/pull  ->  { cibilScore, reportId }
function pullCibil(pan) {
  const h = hashPan(pan.toUpperCase());
  const cibilScore = 300 + (h % 601); // deterministic 300..900
  return {
    pan: pan.toUpperCase(),
    cibilScore,
    pulledAt: new Date().toISOString(),
    provider: "CRIF (MOCK)",
    scoreBand: cibilScore >= 750 ? "Excellent" : cibilScore >= 700 ? "Good" : cibilScore >= 650 ? "Fair" : "Below Average",
  };
}

module.exports = { pullCibil };
