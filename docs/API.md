# Vantage Credit — API Reference

RBI-compliant embedded credit marketplace. All routes are under `/api`.
Funds never flow through the platform — disbursal is recorded as a state
change only. KFS is always generated **before** routing, and disbursal is
blocked unless a KFS exists.

Base URL: `http://localhost:5000` (Docker: same port; the client proxies `/api`).

---

## Authentication

The JWT is sent as `Authorization: Bearer <token>`. Tokens expire in 12h and
are held in memory by the client (never localStorage).

| Role   | Credentials (seeded) | Scope |
|--------|----------------------|-------|
| DLA    | `dla1` / `Dla@123` | Originate applications, run engine, route |
| LENDER | `lender1` / `Lender@123` | View routed apps (own lender), disburse |
| ADMIN  | `admin` / `Admin@123` | Full access, onboard lenders, admin endpoints |

Credentials are configurable via `SEED_*` env vars (see `.env.example`).

### POST /api/auth/login — public
```json
{ "username": "dla1", "password": "Dla@123" }
```
Returns:
```json
{
  "token": "<jwt>",
  "user": { "username": "dla1", "role": "DLA", "dlaId": "DLA-001", "lenderId": null }
}
```

---

## Applications (DLA / routing)

### POST /api/applications — DLA, ADMIN
DLA submits a new application. `aaConsent` must be `true` (else 400).
Server logs AA consent with timestamp and upserts the borrower profile.

Body:
```json
{
  "borrowerName": "Priya Sharma",
  "pan": "ABCPS1234D",
  "mobile": "9876543210",
  "amount": 150000,
  "purpose": "personal",
  "tenure": 12,
  "cibilScore": 740,
  "monthlyIncome": 75000,
  "monthlyObligations": 15000,
  "dlaId": "DLA-001",
  "aaConsent": true
}
```
Returns `201` with the stored `LoanApplication` (`id` auto-generated, e.g. `APP-004`, status `pending_review`).

### GET /api/applications — all roles (role-scoped)
Query params: `?status=pending_review&dlaId=DLA-001`.

Scoping: DLA sees only its own (`dlaId`), LENDER sees only applications routed
to its lender product (`routedTo`), ADMIN sees all and may filter by `dlaId`.

### GET /api/applications/:id — all roles (role-scoped)
Single application document.

### POST /api/applications/:id/run-engine — DLA, ADMIN
Runs `runCreditEngine()` against every lender product. Does not mutate state.

Returns:
```json
{
  "eligible":  [{ "lender": {...}, "emi": 13143, "score": 84, "reasons": [] }],
  "rejected":  [{ "lender": {...}, "emi": null, "score": 0, "reasons": ["CIBIL 660 below required 680"] }],
  "dti": 0.2
}
```

### POST /api/applications/:id/route — DLA, ADMIN
Body: `{ "lenderId": "L003" }`

Compliance gates (logged to `ComplianceLog`):
1. `KFS_BEFORE_ROUTING` — rejects with `409` if `kfsGenerated` is already true
   (KFS must be generated exactly once, *during* this call, not after).
2. `FLDG_CAP` — rejects if projected FLDG exposure would exceed 5% of the
   lender's portfolio value.

Only eligible lenders may be routed (engine is re-run server-side; routing to
an ineligible lender returns `400` with the rejection reasons). The KFS is
generated and stored in the `ApplicationRoute`, the route row is upserted, and
the application moves to `status: "routed"`, `kfsGenerated: true`.

Returns `{ application, route, kfsData, ocen }` (`ocen` is present when the
lender is OCEN-enabled — a stub).

### POST /api/applications/:id/disburse — LENDER, ADMIN
Lender callback marking disbursal. Gates (logged):
1. `KFS_BEFORE_DISBURSAL` — requires `status === "routed"` and
   `kfsGenerated === true`, else `409`.

Only the lender the application is routed to may disburse it (role-scoped).
Returns the updated application. **No money moves here** — funds flow directly
lender → borrower.

### GET /api/applications/:id/kfs — all roles (role-scoped)
Returns the stored KFS snapshot object for the application's route.
`404` if the application has no KFS yet.

---

## Lenders

### GET /api/lenders — all roles
Full catalogue of lender products (sorted by `id`).

### POST /api/lenders — ADMIN only
Onboard a new lender product. Auto-assigns the next `id` (e.g. `L005`).
```json
{
  "lenderName": "New Lender",
  "type": "NBFC",
  "minAmount": 10000,
  "maxAmount": 300000,
  "interestRate": 15.0,
  "tenureMonths": [3, 6, 12],
  "minCibilScore": 650,
  "maxDti": 0.5,
  "processingFee": 1.5,
  "disbursalTime": "T+1",
  "supportedPurposes": ["personal"],
  "ocenEnabled": false,
  "aaEnabled": true,
  "nachEnabled": true
}
```

### GET /api/lenders/:id/portfolio — LENDER (own), ADMIN
Portfolio stats + FLDG exposure for one lender:
```json
{
  "lender": {...},
  "portfolioValue": 150000,
  "disbursedValue": 0,
  "applicationCount": 1,
  "fldgExposure": 0,
  "fldgCap": 0.05,
  "capLimit": 7500,
  "utilizationPct": 0
}
```
- `portfolioValue` = sum of amounts of routed + disbursed applications.
- `disbursedValue` = sum of amounts of disbursed applications.
- `fldgExposure` = `FLDG_CAP × disbursedValue`.
- `capLimit` = `FLDG_CAP × portfolioValue`.
- `utilizationPct` = exposure / capLimit (capped at 100).

---

## Admin

### GET /api/admin/stats — ADMIN only
```json
{
  "total": 3, "routed": 1, "disbursed": 1, "pending": 1, "rejected": 0,
  "volume": 500000, "avgCibil": 703, "recent": [...]
}
```

### GET /api/admin/compliance — ADMIN only
```json
{
  "capLimit": 0.05,
  "lenders": [
    {
      "lenderId": "L001", "lenderName": "CreditSaison India",
      "portfolioValue": 0, "disbursedValue": 0, "fldgExposure": 0,
      "fldgCap": 0.05, "capLimit": 0, "utilizationPct": 0,
      "status": "compliant"
    }
  ],
  "kfsComplianceRate": 100,
  "kfsCompliant": 2,
  "kfsTotal": 2,
  "complianceLogs": { "total": 14, "failures": 0 }
}
```

---

## Mock India-Stack services

These are **mocked** — each service file documents exactly where the real
integration (CRIF/CIBIL, Finvu AA, Perfios) replaces the mock.

### POST /api/bureau/pull — DLA, ADMIN
Body: `{ "pan": "ABCPS1234D" }` → deterministic CIBIL score 300–900:
```json
{ "pan": "ABCPS1234D", "cibilScore": 740, "pulledAt": "...", "provider": "CRIF (MOCK)", "scoreBand": "Good" }
```
Also writes the score to the borrower profile and logs a `BUREAU_PULL`
compliance entry.

### POST /api/aa/consent — DLA, ADMIN
Body: `{ "pan": "ABCPS1234D" }` → logs AA consent with timestamp:
```json
{ "consentId": "AA-...", "pan": "ABCPS1234D", "status": "GRANTED", "consentedAt": "...", "expiresAt": "...", "aaProvider": "Finvu (MOCK)", "scope": [...] }
```

### POST /api/aa/fetch — DLA, ADMIN
Body: `{ "pan": "ABCPS1234D" }` → mock bank statement:
```json
{
  "pan": "ABCPS1234D", "statementMonths": 6,
  "summary": { "avgMonthlyCredit": 245000, "avgBalance": 68600, "bounceRate": 3 },
  "activeLoans": 1, "provider": "Perfios (MOCK)"
}
```

---

## Compliance rules (enforced in middleware/rbiCompliance.js)

| Check | Trigger | Blocked when | HTTP |
|-------|---------|--------------|------|
| `KFS_BEFORE_ROUTING` | `POST /route` | `kfsGenerated === true` (KFS already exists) or status not `new`/`pending_review` | 409 |
| `KFS_BEFORE_DISBURSAL` | `POST /disburse` | status ≠ `routed` or `kfsGenerated !== true` | 409 |
| `FLDG_CAP` | `POST /route` | projected FLDG exposure > 5% of lender's projected portfolio value | 409 |

Every evaluation is written to the `ComplianceLog` collection with type,
application id, pass/fail, details, and timestamp.

## Validation (middleware/validate.js)

- PAN: `/^[A-Z]{5}[0-9]{4}[A-Z]$/`
- Mobile: `/^[6-9]\d{9}$/`
- Loan amount ≥ ₹5,000 · CIBIL 300–900 · income ≥ ₹10,000 · obligations < income
- Purpose ∈ `personal|consumer|education|medical|emergency|sme|working_capital`
- Tenure ∈ `3,6,9,12,18,24,36,48,60`
- `aaConsent === true` mandatory (else 400)

## Error format

Non-2xx responses use `{ "error": "message" }`; validation failures add
`{ "error": "Validation failed", "errors": { field: "reason" } }`.

## Models

`LoanApplication`, `LenderProduct`, `ApplicationRoute`, `BorrowerProfile`
mirror the frontend mock field names exactly (plus `ocenEnabled` /
`aaEnabled` / `nachEnabled` on lenders). `User` and `ComplianceLog` support
auth and audit respectively. PAN is the only identity key — Aadhaar numbers
are never stored.
