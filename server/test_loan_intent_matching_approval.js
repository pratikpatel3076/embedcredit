// ── Automated Test Suite: Loan Intent Offer Matching & Lender Approval Flow ──
const http = require("http");

const BASE_URL = process.env.API_URL || "http://localhost:5000/api";

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });

    req.on("error", reject);
    if (options.body) req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function login(username, password) {
  const res = await request("/auth/login", {
    method: "POST",
    body: { username, password },
  });
  if (res.status !== 200 || !res.data.token) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function runTests() {
  console.log("=================================================================");
  console.log("   LOAN INTENT MATCHING & LENDER APPROVAL TEST SUITE             ");
  console.log("=================================================================\n");

  console.log("Step 1: Authenticating Platform Roles...");
  const userAuth = await login("user1", "User@123");
  const lenderAuth = await login("lender1", "Lender@123");
  const adminAuth = await login("admin", "Admin@123");

  const userToken = userAuth.token;
  const lenderToken = lenderAuth.token;
  const adminToken = adminAuth.token;

  assert(userAuth.user.role === "USER", "Consumer authenticated as role USER");
  assert(lenderAuth.user.role === "LENDER", "Lender authenticated as role LENDER");
  assert(lenderAuth.user.lenderId === "L001", "Lender user mapped to lenderId L001");
  assert(adminAuth.user.role === "ADMIN", "Admin authenticated as role ADMIN");

  console.log("\nStep 2: Testing Loan Intent Creation & Payload Validation...");

  // 2.1 Missing params validation
  const invalidIntent = await request("/loan-intents", {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
    body: { requestedAmount: 25000 },
  });
  assert(invalidIntent.status === 400, "POST /api/loan-intents without purpose/tenure returns 400 Bad Request");

  // 2.2 Valid Intent Creation for multiple purposes
  const purposes = [
    "Electronics",
    "Shopping",
    "Travel",
    "Healthcare",
    "Education",
    "Home Improvement",
    "Personal",
    "Other",
  ];

  let electronicsIntentId = null;

  for (const p of purposes) {
    const res = await request("/loan-intents", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: {
        purpose: p,
        requestedAmount: 25000,
        preferredTenure: 6,
      },
    });

    assert(res.status === 201, `POST /api/loan-intents for '${p}' returns 201 Created`);
    const id = res.data.id || res.data.loanIntent?.id || res.data.intent?.id;
    assert(typeof id === "string" && id.length > 0, `Returned valid LoanIntent ID (${id}) for purpose '${p}'`);

    if (p === "Electronics") {
      electronicsIntentId = id;
    }
  }

  console.log("\nStep 3: Testing Find-Offers Endpoint & Parameter Validation...");

  // 3.1 Reject literal "undefined"
  const undefinedRes = await request("/loan-intents/undefined/find-offers", {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(
    undefinedRes.status === 400,
    `POST /api/loan-intents/undefined/find-offers returns 400 Bad Request (not 404): status ${undefinedRes.status}`
  );
  assert(
    undefinedRes.data.error?.code === "INVALID_INTENT_ID",
    `Error code is INVALID_INTENT_ID (${undefinedRes.data.error?.code})`
  );

  // 3.2 Reject literal "null"
  const nullRes = await request("/loan-intents/null/find-offers", {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(nullRes.status === 400, "POST /api/loan-intents/null/find-offers returns 400 Bad Request");

  // 3.3 Non-existent ID returns 404 LOAN_INTENT_NOT_FOUND
  const nonExistentRes = await request("/loan-intents/INT-DOES-NOT-EXIST-9999/find-offers", {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(nonExistentRes.status === 404, "POST /api/loan-intents/NON_EXISTENT/find-offers returns 404 Not Found");
  assert(
    nonExistentRes.data.error?.code === "LOAN_INTENT_NOT_FOUND",
    "Error code is LOAN_INTENT_NOT_FOUND"
  );

  // 3.4 Valid intent finds matching lender offers
  const findOffersRes = await request(`/loan-intents/${electronicsIntentId}/find-offers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
  });

  assert(findOffersRes.status === 200, "POST /api/loan-intents/:id/find-offers returns 200 OK");
  assert(Array.isArray(findOffersRes.data.offers), "Offers returned as an array");
  assert(findOffersRes.data.offers.length >= 1, `Found ${findOffersRes.data.offers.length} eligible lender offer(s)`);

  const lender1Offer = findOffersRes.data.offers.find(
    (o) => o.lenderId === "L001" || o.lenderProductId === "L001"
  );
  assert(Boolean(lender1Offer), "lender1 (CreditSaison India) matched as eligible offer");
  if (lender1Offer) {
    assert(lender1Offer.amount === 25000, "Offer amount is ₹25,000");
    assert(lender1Offer.tenure === 6, "Offer tenure is 6 Months");
    assert(lender1Offer.EMI > 0, `Offer EMI calculated: ₹${lender1Offer.EMI}`);
    assert(
      Array.isArray(lender1Offer.eligibilityReasons) && lender1Offer.eligibilityReasons.length >= 3,
      `Eligibility reasons provided (${lender1Offer.eligibilityReasons.length} reasons)`
    );
  }

  // 3.5 Verify GET /api/loan-intents/:id/offers
  const getOffersRes = await request(`/loan-intents/${electronicsIntentId}/offers`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(getOffersRes.status === 200, "GET /api/loan-intents/:id/offers returns 200 OK");

  console.log("\nStep 4: Testing Offer Selection & Non-Auto Approval...");

  assert(Boolean(lender1Offer?.id), "Have valid lender1 offer ID for selection");
  const selectOfferRes = await request(`/offers/${lender1Offer.id}/select`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
  });

  assert(selectOfferRes.status === 201, "POST /api/offers/:id/select returns 201 Created");
  const routedApp = selectOfferRes.data.application;
  assert(Boolean(routedApp), "Selected offer created loan application object");
  assert(routedApp.status === "ROUTED", `Application status is ROUTED (NOT auto-approved): ${routedApp.status}`);
  assert(routedApp.routedTo === "L001", `Application routed to lender1 (L001): ${routedApp.routedTo}`);
  assert(selectOfferRes.data.kfsData && selectOfferRes.data.kfsData.proposalNumber, "KFS snapshot generated");

  // 4.1 Duplicate selection protection
  const dupSelectRes = await request(`/offers/${lender1Offer.id}/select`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(dupSelectRes.status === 409, "Duplicate offer selection returns 409 Conflict");

  console.log("\nStep 5: Testing Lender Underwriting Approval (RBAC & Facility Activation)...");

  // 5.1 ADMIN cannot approve loan
  const adminApproveRes = await request(`/applications/${routedApp.id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    adminApproveRes.status === 403,
    `ADMIN forbidden from approving loan application (HTTP ${adminApproveRes.status})`
  );

  // 5.2 LENDER approves loan application
  const lenderApproveRes = await request(`/applications/${routedApp.id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lenderToken}` },
  });

  assert(lenderApproveRes.status === 200, "LENDER (lender1) can approve loan (HTTP 200)");
  assert(
    lenderApproveRes.data.application?.status === "APPROVED",
    `Application status transitioned to APPROVED: ${lenderApproveRes.data.application?.status}`
  );

  console.log("\nStep 6: Verifying Credit Facility Activation & Drawdown Flow...");

  // 6.1 Consumer credit account query
  const creditAccRes = await request("/credit/account", {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(creditAccRes.status === 200, "Consumer can query GET /api/credit/account (200 OK)");
  assert(creditAccRes.data.account?.status === "ACTIVE", "Credit facility is ACTIVE");
  assert(creditAccRes.data.balance?.availableCredit > 0, `Available borrowing capacity: ₹${creditAccRes.data.balance?.availableCredit}`);

  // 6.2 Consumer drawdown / consumption
  const drawRes = await request("/credit/consume", {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
    body: {
      amount: 5000,
      purpose: "electronics",
      merchant: "Croma Digital",
      idempotencyKey: `test-matching-draw-${Date.now()}`,
    },
  });
  assert(drawRes.status === 200 || drawRes.status === 201, `Consumer can perform instant credit drawdown from approved facility (HTTP ${drawRes.status})`);
  assert(
    (drawRes.data.event?.eventType || drawRes.data.eventType) === "CREDIT_CONSUMED",
    "Ledger event CREDIT_CONSUMED recorded"
  );

  console.log("\n=================================================================");
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED               `);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
