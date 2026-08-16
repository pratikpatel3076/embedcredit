# EmbedCredit — Embedded Credit Marketplace (MERN)

RBI-compliant (Digital Lending Guidelines 2022) marketplace that matches
borrower applications originated by Digital Lending Apps (DLAs) to eligible
Banks/NBFCs, generates the mandatory Key Fact Statement (KFS) before routing,
enforces a 5% FLDG cap per lender, and records disbursal — while never touching
money itself (funds flow lender → borrower directly).

## Tech Stack

- Client: React 18 + Vite (design preserved from original prototype)
- Server: Node.js + Express
- DB: MongoDB (Mongoose ODM)
- Auth: JWT (in-memory on client), 3 roles — DLA, LENDER, ADMIN
- Mock services: CIBIL bureau pull, AA (Account Aggregator), OCEN 4.0
- Docker: mongo + server + client via docker-compose

## Repository Layout

```
vantage-credit/
  client/         React app (src/App.jsx = full UI, wired to /api)
  server/
    models/       LoanApplication, LenderProduct, ApplicationRoute,
                  BorrowerProfile, User, ComplianceLog
    services/     creditEngine.js, kfsGenerator.js (ported 1:1 from frontend),
                  bureauService.js, aaService.js, ocenService.js (mocks)
    routes/       auth, dla, lender, admin, engine
    middleware/   validate.js, rbiCompliance.js, auth.js
    config/       constants.js (FLDG_CAP=0.05, MAX_DTI=0.55), db.js
    seed.js       demo data (idempotent)
  docs/API.md     full route reference
  docker-compose.yml, .env.example
```

## Prerequisites (one-time)

- Node.js 18+ and MongoDB (or Docker + Docker Compose)
- Copy `.env.example` → `server/.env` (defaults work out of the box)

## Run

```powershell
# Local
cd vantage-credit
npm run install:all     # installs client + server deps
npm run dev             # API :5000 + client :3000

# Docker
docker compose up --build   # client :3000, API :5000, mongo :27017
```

The server auto-seeds on first boot: 3 users, 4 lender products, 3 applications.

## Demo Logins (seeded)

| Role   | Username | Password     | Scope                                              |
|--------|----------|--------------|----------------------------------------------------|
| DLA    | dla1     | Dla@123      | Submit apps, run engine, route                     |
| LENDER | lender1  | Lender@123   | View apps routed to HDFC (L003), disburse          |
| ADMIN  | admin    | Admin@123    | Full access, onboard lenders, admin stats          |

## Key API (base http://localhost:5000/api)

- `POST /auth/login` — get JWT
- `POST /applications` — DLA submits (aaConsent: true required)
- `GET /applications` · `GET /applications/:id` — role-scoped lists
- `POST /applications/:id/run-engine` — eligibility match vs all lenders
- `POST /applications/:id/route` — generates + stores KFS, routes app
- `POST /applications/:id/disburse` — lender callback (KFS gate)
- `GET /applications/:id/kfs` — stored KFS document
- `GET /lenders` · `POST /lenders` (admin) · `GET /lenders/:id/portfolio`
- `GET /admin/stats` · `GET /admin/compliance`
- `POST /bureau/pull` · `POST /aa/consent` · `POST /aa/fetch`

## Compliance (enforced + logged to ComplianceLog)

1. KFS generated BEFORE routing, exactly once (409 on re-route).
2. Disbursal blocked unless status=routed AND kfsGenerated=true (409).
3. FLDG exposure ≤ 5% of lender's portfolio value (409 on breach).
4. aaConsent: true mandatory on every DLA submission (400 otherwise).
5. PAN is the only identity key — Aadhaar never stored.
6. No payment processing — disbursal is a state change only.

## Test Flow

1. Login as `dla1` → New Application → enable AA consent → "Pull CIBIL" → submit.
2. Credit Engine → select the new app → Run Engine → Route to top-scored lender
   (KFS appears).
3. Logout, login as `lender1` → see routed app → Disburse.
4. Login as `admin` → Dashboard stats, Lenders (portfolio/FLDG), admin
   compliance view.
