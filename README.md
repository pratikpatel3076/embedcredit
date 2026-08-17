# EmbedCredit — Embedded Consumption Credit Marketplace

> **A compliant, non-custodial credit marketplace connecting Consumers, DLAs/LSPs, and Banks/NBFCs.**

## Problem

The digital lending ecosystem is fragmented between **consumers, Digital Lending Apps (DLAs), Loan Service Providers (LSPs), and regulated lenders**.

Consumers often face difficulty in:

* Discovering suitable consumption-credit products
* Comparing multiple lender offers
* Understanding their available credit
* Accessing approved credit when needed
* Managing repayments

At the same time, DLAs/LSPs face integration complexity when connecting with multiple lenders.

### Problem Statement

> **Build a digital lending marketplace focused on expanding access and availability of consumption credit while simplifying integrations between Digital Lending Apps, lenders, and Loan Service Providers.**

---

## Solution

**EmbedCredit** acts as the marketplace and orchestration layer between consumers, DLAs/LSPs, and regulated lenders.

It enables consumers to:

```text
Create Profile
      ↓
Build Credit Profile
      ↓
Give Required Consent
      ↓
Discover Credit Offers
      ↓
Compare Lender Products
      ↓
Select Offer
      ↓
KFS
      ↓
Lender Underwriting
      ↓
Approved Credit Facility
      ↓
Get Credit
      ↓
Loan / Drawdown
      ↓
Installment Repayment
      ↓
Credit Restored
```

EmbedCredit **does not become the lender and does not handle loan funds**.

Actual funds flow directly between the lender and borrower.

---

# Architecture

```text
                         CONSUMER
                            │
                            ▼
                     USER PROFILE
                            │
                            ▼
                    CREDIT PROFILE
                            │
                            ▼
                    CREDIT INTENT
                            │
                            ▼
                 ┌──────────────────┐
                 │   EMBEDCREDIT    │
                 │    MARKETPLACE   │
                 └────────┬─────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
          BANK A        NBFC A       BANK B
             │            │            │
             └────────────┼────────────┘
                          ▼
                    LOAN OFFERS
                          │
                          ▼
                  OFFER SELECTION
                          │
                          ▼
                         KFS
                          │
                          ▼
                 LENDER UNDERWRITING
                          │
                    ┌─────┴─────┐
                    ▼           ▼
                 APPROVED     REJECTED
                    │
                    ▼
              CREDIT FACILITY
                    │
                    ▼
                 GET CREDIT
                    │
                    ▼
                  DRAWDOWN
                    │
                    ▼
            CONSUMPTION CREDIT
                    │
                    ▼
                REPAYMENT
                    │
                    ▼
             CREDIT UTILIZATION
                    │
                    ▼
             AVAILABLE CREDIT
```

---

# Application Architecture

```text
┌──────────────────────────────────────────────┐
│                    CLIENT                    │
│                 React + Vite                 │
│                                              │
│ Consumer │ DLA │ Lender │ Admin Dashboard   │
└──────────────────────┬───────────────────────┘
                       │
                    REST API
                       │
                       ▼
┌──────────────────────────────────────────────┐
│                   SERVER                     │
│               Node.js + Express              │
│                                              │
│ Authentication / RBAC                        │
│ Application Management                       │
│ Credit Marketplace                           │
│ Credit Facility                              │
│ Loan & Drawdown                              │
│ Repayment                                    │
│ AA / Consent                                 │
│ KFS                                          │
│ Compliance                                   │
│ Credit Events                                │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│                  MONGODB                     │
│                                              │
│ Users                                        │
│ Profiles                                     │
│ Credit Accounts                              │
│ Applications                                │
│ Offers                                       │
│ Lender Products                              │
│ Loans                                        │
│ Repayment Schedules                          │
│ Consent Records                              │
│ Credit Events                                │
│ Compliance Logs                              │
└──────────────────────────────────────────────┘
```

---

# Core Workflow

## Consumer

```text
Register
   ↓
Complete Profile
   ↓
AA / Required Consents
   ↓
CIBIL + Financial Data
   ↓
Enter Consumption Requirement
   ↓
Marketplace Matching
   ↓
View Offers
   ↓
Select Offer
   ↓
KFS
   ↓
Lender Approval
   ↓
Credit Facility
   ↓
Get Credit
   ↓
Loan Created
   ↓
Repayment Schedule
   ↓
Installments
   ↓
Loan Closed
```

## DLA / LSP

```text
Consumer / Application
        ↓
       DLA
        ↓
 EmbedCredit APIs
        ↓
Eligibility & Marketplace
        ↓
   Lender Offers
        ↓
       KFS
        ↓
      Lender
```

## Lender

```text
Application
    ↓
Eligibility
    ↓
Offer
    ↓
Underwriting
    ↓
Approve / Reject
    ↓
Credit Facility
    ↓
Disbursal
    ↓
Repayment
```

## Admin

```text
Platform Data
     ↓
Analytics
     ↓
Compliance
     ↓
FLDG Monitoring
     ↓
System Overview
```

> **Admin is read-only and cannot approve, reject, create, route, or disburse loans.**

---

# Consumption Credit

Consumption credit is the core differentiator of EmbedCredit.

An approved credit facility maintains:

```text
Credit Limit
     │
     ├── Available Credit
     │
     ├── Utilized Credit
     │
     └── Reserved Credit
```

Example:

```text
Credit Limit       ₹100,000
Available          ₹100,000
Utilized                 ₹0

        ↓ Get Credit ₹20,000

Credit Limit       ₹100,000
Available           ₹80,000
Utilized            ₹20,000
```

The consumer can then use the approved facility through a controlled **loan/drawdown** flow.

---

# Repayment Workflow

```text
₹20,000 Loan
      ↓
Repayment Schedule
      ↓
Installment Paid
      ↓
Principal Reduced
      ↓
Credit Utilization Reduced
      ↓
Available Credit Restored
```

Example:

```text
Credit Limit       ₹100,000
Utilized Credit     ₹20,000
Available Credit    ₹80,000

        ↓ Repay Principal ₹3,000

Utilized Credit     ₹17,000
Available Credit    ₹83,000
```

The actual repayment funds do not pass through EmbedCredit.

---

# Compliance Architecture

```text
Consumer
   ↓
Explicit Consent
   ↓
AA / Bureau Data
   ↓
Purpose Validation
   ↓
Credit Matching
   ↓
KFS Generation
   ↓
Lender Routing
   ↓
Lender Decision
   ↓
Disbursal State
   ↓
Repayment
```

### Core Controls

* **KFS must be generated before routing**
* **Purpose-specific AA/data consent**
* **5% FLDG cap enforcement**
* **No Aadhaar storage**
* **No money custody**
* **Idempotent credit operations**
* **Immutable credit events**
* **Server-side financial validation**
* **Role-based access control**
* **Admin remains read-only**

---

# Final Architecture Vision

```text
                    ┌──────────────┐
                    │   CONSUMER   │
                    └──────┬───────┘
                           │
                     Credit Profile
                           │
                           ▼
                 ┌───────────────────┐
                 │   EMBEDCREDIT     │
                 │                   │
                 │ Marketplace       │
                 │ Consent           │
                 │ Credit Matching   │
                 │ KFS               │
                 │ Credit Facility   │
                 │ Drawdown          │
                 │ Repayment         │
                 │ Compliance        │
                 └───────┬───────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
         DLA / LSPs             BANKS / NBFCs
              │                     │
              └──────────┬──────────┘
                         │
                         ▼
                   CREDIT ECOSYSTEM
```

---

## Vision

> **EmbedCredit is a non-custodial embedded credit marketplace that connects consumers and DLAs/LSPs with regulated lenders, enabling consumers to discover, access, consume, and repay credit through a compliant and auditable credit infrastructure.**
