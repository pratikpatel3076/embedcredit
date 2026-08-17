/**
 * Test Suite: EmbedCredit Admin Role Refactor Verification
 * Validates:
 * 1. All GET /api/admin/* endpoints succeed (200 OK) with rich data & data minimization (masked PAN, no secrets).
 * 2. All mutation endpoints reject ADMIN requests with 403 Forbidden (RBAC enforcement).
 * 3. Operational workflows for USER, DLA, and LENDER roles continue functioning properly.
 */

const BASE_URL = "http://localhost:5000/api";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(username, password) {
  const res = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200 || !res.data.token) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

let passed = 0;
let failed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${details ? "- " + details : ""}`);
    failed++;
  }
}

async function runTests() {
  console.log("=================================================================");
  console.log("   EMBEDCREDIT ADMIN MODULE REFACTOR AUTOMATED TEST SUITE        ");
  console.log("=================================================================\n");

  // Step 1: Log in with all 4 platform roles
  console.log("Step 1: Authenticating platform roles...");
  const adminAuth = await login("admin", "Admin@123");
  const dlaAuth = await login("dla1", "Dla@123");
  const lenderAuth = await login("lender1", "Lender@123");
  const userAuth = await login("user1", "User@123");

  const adminToken = adminAuth.token;
  const dlaToken = dlaAuth.token;
  const lenderToken = lenderAuth.token;
  const userToken = userAuth.token;

  assert(adminAuth.user.role === "ADMIN", "Admin authenticated as role ADMIN");
  assert(dlaAuth.user.role === "DLA", "DLA authenticated as role DLA");
  assert(lenderAuth.user.role === "LENDER", "Lender authenticated as role LENDER");
  assert(userAuth.user.role === "USER", "Consumer authenticated as role USER");

  console.log("\nStep 2: Verifying Admin Read-Only APIs (200 OK & Data Minimization)...");

  // 2.1 Admin Dashboard
  const dashRes = await request("/admin/dashboard", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(dashRes.status === 200, "GET /api/admin/dashboard returns 200 OK");
  assert(dashRes.data.overview && typeof dashRes.data.overview.totalApplications === "number", "Dashboard includes overview metrics");
  assert(dashRes.data.funnel && typeof dashRes.data.funnel.applications === "number", "Dashboard includes conversion funnel snapshot");

  // 2.2 Admin Applications (with search, pagination & masked PAN)
  const appsRes = await request("/admin/applications?limit=5", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(appsRes.status === 200, "GET /api/admin/applications returns 200 OK");
  assert(Array.isArray(appsRes.data.applications), "Applications list is an array");
  if (appsRes.data.applications.length > 0) {
    const sampleApp = appsRes.data.applications[0];
    const isMasked = sampleApp.pan && (sampleApp.pan.includes("****") || sampleApp.pan.includes("*****"));
    assert(isMasked, `Application PAN is masked for ADMIN (${sampleApp.pan})`);
  }

  // 2.3 Admin Single Application Detail
  let testAppId = "APP-001";
  if (appsRes.data.applications.length > 0) {
    testAppId = appsRes.data.applications[0].id;
  }
  const appDetailRes = await request(`/admin/applications/${testAppId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(appDetailRes.status === 200, `GET /api/admin/applications/${testAppId} returns 200 OK`);
  assert(appDetailRes.data.application, "Application inspector payload contains application object");
  assert(Array.isArray(appDetailRes.data.complianceHistory), "Inspector contains complianceHistory audit trail");

  // 2.4 Admin Users Explorer (Data Minimization)
  const usersRes = await request("/admin/users?limit=10", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(usersRes.status === 200, "GET /api/admin/users returns 200 OK");
  assert(Array.isArray(usersRes.data.users), "Users list is an array");
  const secretsExposed = usersRes.data.users.some(u => u.password || u.passwordHash || u.apiSecret);
  assert(!secretsExposed, "User list strictly does NOT expose passwords or secrets");

  // 2.5 Admin Single User Detail
  const singleUserRes = await request(`/admin/users/USR-001`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(singleUserRes.status === 200, "GET /api/admin/users/USR-001 returns 200 OK");
  assert(!singleUserRes.data.user?.password, "Single user payload does NOT expose password");

  // 2.6 Admin Lenders Catalogue & Performance
  const lendersRes = await request("/admin/lenders", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(lendersRes.status === 200, "GET /api/admin/lenders returns 200 OK");
  assert(Array.isArray(lendersRes.data.lenders), "Lenders list returned");
  assert(lendersRes.data.lenders.length > 0 && lendersRes.data.lenders[0].metrics !== undefined, "Lender catalogue includes performance & FLDG metrics");

  // 2.7 Admin DLA Partners
  const dlasRes = await request("/admin/dlas", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(dlasRes.status === 200, "GET /api/admin/dlas returns 200 OK");
  assert(Array.isArray(dlasRes.data.dlas), "DLA partners list returned");

  // 2.8 Admin Multi-Stage Analytics Funnel
  const analyticsRes = await request("/admin/analytics", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(analyticsRes.status === 200, "GET /api/admin/analytics returns 200 OK");
  assert(Array.isArray(analyticsRes.data.funnel) && analyticsRes.data.funnel.length >= 8, "Funnel contains 8 full lifecycle stages");

  // 2.9 Admin Consumption Credit Analytics
  const consumptionRes = await request("/admin/analytics/consumption", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(consumptionRes.status === 200, "GET /api/admin/analytics/consumption returns 200 OK");
  assert(Array.isArray(consumptionRes.data.categories) && consumptionRes.data.categories.length >= 8, "Consumption analytics broken down by 8+ purposes");

  // 2.10 Admin Compliance Dashboard
  const compRes = await request("/admin/compliance", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(compRes.status === 200, "GET /api/admin/compliance returns 200 OK");
  assert(compRes.data.kfsComplianceRate !== undefined, "Compliance dashboard includes KFS generation rate");
  assert(compRes.data.capLimit === 0.05, "FLDG Cap Limit is verified at 5% (0.05)");

  // 2.11 Admin FLDG Monitoring
  const fldgRes = await request("/admin/fldg", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(fldgRes.status === 200, "GET /api/admin/fldg returns 200 OK");
  assert(Array.isArray(fldgRes.data.monitoring), "FLDG monitoring includes lender portfolio caps");
  assert(Array.isArray(fldgRes.data.blockedRouteEvents), "FLDG monitoring tracks blocked route events");

  // 2.12 Admin Audit Logs
  const auditRes = await request("/admin/audit-logs?limit=10", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(auditRes.status === 200, "GET /api/admin/audit-logs returns 200 OK");
  assert(Array.isArray(auditRes.data.logs), "Audit logs stream returned");
  assert(Array.isArray(auditRes.data.availableEventTypes), "Available event types list provided for filtering");

  // 2.13 Admin System Health
  const healthRes = await request("/admin/system-health", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(healthRes.status === 200, "GET /api/admin/system-health returns 200 OK");
  assert(healthRes.data.status === "HEALTHY", "Platform status reported as HEALTHY");
  assert(healthRes.data.database?.status === "CONNECTED", "Database reported as CONNECTED");

  console.log("\nStep 3: Verifying RBAC Denials for ADMIN on all Mutation Endpoints (403 Forbidden)...");

  // 3.1 ADMIN creating application -> 403 Forbidden
  const createDraftApp = await request("/applications", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      borrowerName: "Admin Test",
      pan: "ABCDE1234F",
      amount: 50000,
      tenure: 12,
      purpose: "personal",
    }),
  });
  assert(createDraftApp.status === 403, `ADMIN denied POST /api/applications (HTTP ${createDraftApp.status})`);

  // 3.2 ADMIN executing credit engine -> 403 Forbidden
  const runEngineAdmin = await request(`/applications/${testAppId}/run-engine`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(runEngineAdmin.status === 403, `ADMIN denied POST /api/applications/:id/run-engine (HTTP ${runEngineAdmin.status})`);

  // 3.3 ADMIN routing application -> 403 Forbidden
  const routeAdmin = await request(`/applications/${testAppId}/route`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ lenderId: "LND-001" }),
  });
  assert(routeAdmin.status === 403, `ADMIN denied POST /api/applications/:id/route (HTTP ${routeAdmin.status})`);

  // 3.4 ADMIN approving loan -> 403 Forbidden
  const approveAdmin = await request(`/applications/${testAppId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(approveAdmin.status === 403, `ADMIN denied POST /api/applications/:id/approve (HTTP ${approveAdmin.status})`);

  // 3.5 ADMIN rejecting loan -> 403 Forbidden
  const rejectAdmin = await request(`/applications/${testAppId}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reasonCode: "TEST_REJECT" }),
  });
  assert(rejectAdmin.status === 403, `ADMIN denied POST /api/applications/:id/reject (HTTP ${rejectAdmin.status})`);

  // 3.6 ADMIN disbursing loan -> 403 Forbidden
  const disburseAdmin = await request(`/applications/${testAppId}/disburse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(disburseAdmin.status === 403, `ADMIN denied POST /api/applications/:id/disburse (HTTP ${disburseAdmin.status})`);

  // 3.7 ADMIN creating lender -> 403 Forbidden
  const createLenderAdmin = await request("/lenders", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ lenderName: "Unauthorized Bank" }),
  });
  assert(createLenderAdmin.status === 403, `ADMIN denied POST /api/lenders (HTTP ${createLenderAdmin.status})`);

  // 3.8 ADMIN updating lender -> 403 Forbidden
  const updateLenderAdmin = await request("/lenders/LND-001", {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ interestRate: 5.0 }),
  });
  assert(updateLenderAdmin.status === 403, `ADMIN denied PUT /api/lenders/:id (HTTP ${updateLenderAdmin.status})`);

  // 3.9 ADMIN deleting lender -> 403 Forbidden
  const deleteLenderAdmin = await request("/lenders/LND-001", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(deleteLenderAdmin.status === 403, `ADMIN denied DELETE /api/lenders/:id (HTTP ${deleteLenderAdmin.status})`);

  // 3.10 ADMIN creating product -> 403 Forbidden
  const createProductAdmin = await request("/products", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: "Personal Loan Pro" }),
  });
  assert(createProductAdmin.status === 403, `ADMIN denied POST /api/products (HTTP ${createProductAdmin.status})`);

  // 3.11 ADMIN pulling bureau -> 403 Forbidden
  const bureauPullAdmin = await request("/bureau/pull", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ pan: "ABCDE1234F" }),
  });
  assert(bureauPullAdmin.status === 403, `ADMIN denied POST /api/bureau/pull (HTTP ${bureauPullAdmin.status})`);

  // 3.12 ADMIN creating DLA partner -> 403 Forbidden
  const createDlaAdmin = await request("/admin/dla-partners", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: "Rogue DLA" }),
  });
  assert(createDlaAdmin.status === 403, `ADMIN denied POST /api/admin/dla-partners (HTTP ${createDlaAdmin.status})`);

  // 3.13 ADMIN regenerating DLA key -> 403 Forbidden
  const regenKeyAdmin = await request("/admin/dla-partners/DLA-001/regenerate-key", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(regenKeyAdmin.status === 403, `ADMIN denied POST /api/admin/dla-partners/:id/regenerate-key (HTTP ${regenKeyAdmin.status})`);

  console.log("\nStep 4: Verifying Operational Workflows for USER, DLA, and LENDER remain intact...");

  // 4.1 Consumer Flow
  const userProfile = await request("/credit-profile", {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(userProfile.status === 200, "USER can query GET /api/credit-profile (200 OK)");

  const createIntent = await request("/loan-intents", {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({
      requestedAmount: 45000,
      preferredTenure: 6,
      purpose: "Electronics",
    }),
  });
  assert(createIntent.status === 201, "USER can create POST /api/loan-intents (201 Created)");

  // 4.2 DLA Flow
  const createDlaApp = await request("/applications", {
    method: "POST",
    headers: { Authorization: `Bearer ${dlaToken}` },
    body: JSON.stringify({
      borrowerName: "Ananya Deshmukh",
      pan: "ABCAD1234D",
      mobile: "9876543210",
      amount: 80000,
      tenure: 12,
      purpose: "Shopping",
      cibilScore: 740,
      monthlyIncome: 65000,
      monthlyObligations: 12000,
      aaConsent: true,
    }),
  });
  assert(createDlaApp.status === 200 || createDlaApp.status === 201, `DLA can create POST /api/applications (HTTP ${createDlaApp.status})`);

  const newAppId = createDlaApp.data?.application?.id || createDlaApp.data?.id;
  if (newAppId) {
    const runEngineDla = await request(`/applications/${newAppId}/run-engine`, {
      method: "POST",
      headers: { Authorization: `Bearer ${dlaToken}` },
    });
    assert(runEngineDla.status === 200, "DLA can execute POST /api/applications/:id/run-engine (200 OK)");
  }

  // 4.3 Lender Flow
  const lenderApps = await request("/applications", {
    headers: { Authorization: `Bearer ${lenderToken}` },
  });
  assert(lenderApps.status === 200, "LENDER can query GET /api/applications (200 OK)");

  const lenderPortfolio = await request(`/lenders/${lenderAuth.user.lenderId || "LND-001"}/portfolio`, {
    headers: { Authorization: `Bearer ${lenderToken}` },
  });
  assert(lenderPortfolio.status === 200, "LENDER can query GET /api/lenders/:id/portfolio (200 OK)");

  console.log("\n=================================================================");
  console.log(`   TEST RESULTS SUMMARY: ${passed} PASSED, ${failed} FAILED     `);
  console.log("=================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
