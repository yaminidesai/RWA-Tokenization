# RWA Tokenization Platform

> This project models institutional US Treasury bond tokenization on Canton Network — the workflow major financial institutions are currently building in production for DTC-custodied securities settlement.

---

## Overview

This platform implements the complete lifecycle of a tokenized US Treasury security on Canton Network: investor onboarding with KYC/AML clearance, DTC custody attestation, atomic token minting at 1:1 backing, peer-to-peer transfer with compliance gating, semiannual coupon distribution, and final principal redemption. A qualified custodian (the escrow bank) holds real Treasuries in its DTC participant account, creates an on-ledger `CustodyRecord` as self-attestation of that position, and mints `TokenizedBond` tokens strictly against that custody. The regulator receives read-only observer visibility into every holding, KYC record, and custody position — full market surveillance capability without being a transacting party.

The codebase demonstrates that DAML is not merely a smart-contract language but a formal authorization framework. The 9 DAML templates encode who can authorize what, who can see what, and what invariants must hold — in a way that is machine-checked at every transaction submission.

---

## Why Institutional Finance Needs This

Current US Treasury settlement runs on T+1, routing through at least three separate ledgers: the issuer (TreasuryDirect / Fedwire Securities), the central securities depository (DTC), and broker/dealer position records. Nightly reconciliation across these systems costs the industry billions annually and introduces fail risk estimated at 2–3% of daily settlement volume.

A Canton-based tokenization layer solves this by making the custody record and the token positions the **same** ledger. Key design properties that matter to institutions:

- **Privacy by protocol, not policy.** DAML's signatory/observer model means Investor A literally cannot query Investor B's holdings at the protocol level — no ACL configuration can accidentally expose them. This is the property that makes Canton suitable for a consortium of competing banks.
- **Atomic settlement.** Token creation and custody position increment happen in a single DAML transaction. There is no window in which a token exists without backing, or in which backing is recorded without a token.
- **Regulator visibility without authority.** The `regulator` party is an observer on every material contract — it sees all positions, KYC status, and custody backing — but cannot unilaterally exercise any choice. This mirrors how the SEC and OCC receive regulatory reporting without having operational access to the custodian's systems.
- **Compliance encoded in logic.** Transfer requires both investor consent and bank co-authorization. The bank's off-chain Transfer Service verifies KYC status, OFAC sanctions, Reg D holding periods, and accreditation before co-signing. If any check fails, the on-chain transaction is never submitted.

---

## DAML Contract Model

Nine templates across four modules implement the full workflow:

### `RWA.AssetCustody` — DTC Position Attestation

| Template | Signatories | Observers | Purpose |
|---|---|---|---|
| `CustodyRecord` | `escrowBank` | `regulator` | On-ledger attestation of bonds held in DTC account; enforces `totalMintedUnits ≤ quantity` invariant at the protocol level |

The `ensure` clause on `CustodyRecord` is the core of 1:1 backing: `totalMintedUnits <= quantity` is enforced by the DAML runtime on every contract creation and update — not by application logic that could be bypassed.

### `RWA.KYC` — Investor Onboarding and Compliance Status

| Template | Signatories | Observers | Purpose |
|---|---|---|---|
| `KYCInvitation` | `escrowBank` | `investor`, `regulator` | Bank initiates onboarding after investor registers on the portal; investor acceptance triggers off-chain Jumio/Onfido identity verification |
| `InvestorKYC` | `escrowBank` | `investor`, `regulator` | Active KYC certificate — records AML clearance, OFAC screening, accreditation level (Retail/Accredited/QP/QIB), expiry date, and Jumio provider reference |

The bank is the sole signatory on `InvestorKYC` because KYC is the bank's regulatory determination, not a mutual agreement. Choices: `ApproveKYC`, `RevokeKYC`, `RenewKYC`, `UpdateAccreditation`.

### `RWA.EscrowRequest` — Two-Leg Purchase Settlement

| Template | Signatories | Observers | Purpose |
|---|---|---|---|
| `EscrowRequest` | `escrowBank`, `investor` | `regulator` | Investor's purchase intent; investor's `maxPurchasePrice` is binding — `ConfirmCustodyAndMint` fails if actual DTC price exceeds it |
| `ApprovedPurchase` | `escrowBank`, `investor` | `regulator` | Intermediate state: bank approved, awaiting DTC settlement (MT545); triggers off-chain bond purchase via SWIFT MT541 |
| `RejectedRequest` | `escrowBank`, `investor` | `regulator` | Immutable audit record of any rejected or cancelled request |

The purchase flow models real delivery-versus-payment (DVP): `ConfirmCustodyAndMint`, `RecordMinting`, and `TokenizedBond` creation are composed atomically by the off-chain Minting Service in a single DAML transaction. No token is ever created without confirmed DTC settlement.

### `RWA.TokenizedBond` — The On-Chain Token

| Template | Signatories | Observers | Purpose |
|---|---|---|---|
| `TokenizedBond` | `escrowBank` | `currentOwner`, `regulator` | Investor's on-ledger ownership position; each token carries `dtcSettlementRef` linking it to the DTC settlement event that created it |
| `CouponPaymentRecord` | `escrowBank` | `investor`, `regulator` | Immutable on-chain receipt of each coupon payment with ACH trace / Fedwire IMAD reference |
| `RedemptionRequest` | `escrowBank`, `investor` | `regulator` | Co-signed redemption intent; `ApproveRedemption` + `BurnToken` + `CustodyRecord.RecordRedemption` execute atomically |

Transfer requires **both** `currentOwner` and `escrowBank` as controllers — the investor must consent, and the bank must verify KYC/OFAC/Reg D compliance before co-signing. Neither party alone can move a position.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Canton Network                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  DAML Ledger (LF 2.1)                        │  │
│  │                                                              │  │
│  │  CustodyRecord ──► TokenizedBond ──► RedemptionRequest       │  │
│  │       │                │                    │                │  │
│  │  RecordMinting    BurnToken          CustodyRecord           │  │
│  │                                      .RecordRedemption       │  │
│  │  InvestorKYC ◄── KYCInvitation                              │  │
│  │  EscrowRequest ──► ApprovedPurchase ──► [atomic mint tx]     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Canton JSON Ledger API
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                   Node.js Backend (TypeScript)                      │
│                                                                     │
│  Services: KYC · Purchase · Transfer · Redemption · Coupon          │
│  Mock integrations: DTC · Fedwire · Jumio                           │
│  Middleware: JWT auth · audit logging · rate limiting               │
│  27 REST endpoints across 4 route groups                            │
│  PostgreSQL: ledger event projections + investor registry           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ REST / JSON
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                   React Frontend (Vite + Tailwind)                  │
│                                                                     │
│  Investor Portal: Dashboard · Bond Market · Holdings · Transfer     │
│  Admin Portal:    KYC Approval · Custody Manager · Admin Dashboard  │
└─────────────────────────────────────────────────────────────────────┘
```

The backend does not implement business logic — it is an orchestration layer. It submits DAML commands to the ledger and projects ledger events into PostgreSQL for query performance. All business rules (1:1 backing, KYC gating, transfer authorization, price limits) live in the DAML model where they are machine-enforced.

---

## Security and Compliance Controls

These properties are enforced by the DAML runtime, not by application code that could be misconfigured:

| Control | Where Enforced | Requirement |
|---|---|---|
| No token minted without DTC custody backing | `CustodyRecord.ensure: totalMintedUnits ≤ quantity` | Qualified custodian / 1:1 backing |
| No transfer without bank co-authorization | `TransferOwnership controller: currentOwner, escrowBank` | KYC/OFAC/Reg D compliance gate |
| No self-transfer | `assertMsg "Cannot transfer to self"` in both transfer choices | Wash trade prevention |
| No split exceeding position | `assertMsg "Cannot transfer more than owned"` | Position integrity |
| No redemption without investor initiation | `InitiateRedemption controller: currentOwner` | Investor consent |
| Redemption amount must be positive | `assertMsg` in `ApproveRedemption` | Settlement integrity |
| KYC state machine enforced | `ApproveKYC` asserts `KYCPending`; `RevokeKYC` asserts `KYCApproved` | Prevents illegal state transitions |
| Investor A cannot see Investor B's data | DAML privacy model: signatory/observer lists | Competitive confidentiality |
| Price slippage protection | `ConfirmCustodyAndMint` asserts `actualPrice ≤ maxPurchasePrice` | Best execution |
| Audit trail on every transfer | `transferHistory` field append-only | SEC recordkeeping (Rule 17a-4) |

---

## Project Structure

```
rwa-tokenization/
├── daml/
│   ├── RWA/
│   │   ├── Types.daml            # Enums and value types (KYCStatus, BondMetadata, AccreditationLevel, …)
│   │   ├── AssetCustody.daml     # CustodyRecord: DTC position attestation + 1:1 backing invariant
│   │   ├── KYC.daml              # InvestorKYC + KYCInvitation: onboarding and compliance lifecycle
│   │   ├── EscrowRequest.daml    # EscrowRequest + ApprovedPurchase + RejectedRequest: two-leg purchase
│   │   └── TokenizedBond.daml    # TokenizedBond + CouponPaymentRecord + RedemptionRequest: the token
│   └── Test/
│       ├── Setup.daml            # Shared party allocation, sample data (CUSIP 912828YV6), mint helpers
│       ├── KYCTests.daml         # 8 tests: invitation flow, approve, renew, revoke, accreditation, guards
│       ├── PurchaseTests.daml    # 8 tests: full mint, two positions, custody increase, reject, cancel, guards
│       ├── RedemptionTests.daml  # 9 tests: full redemption, full-burn flag, reject, coupon records, guards
│       ├── TransferTests.daml    # 7 tests: full transfer, split, transfer chain, self-transfer guard, guards
│       └── PrivacyTests.daml     # 6 tests: investor isolation, regulator visibility, backing verification
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── middleware/       # auth.ts (JWT), audit.ts (request logging), error.ts
│   │   │   └── routes/           # auth · investor · bonds · admin (27 endpoints total)
│   │   ├── services/             # kyc · purchase · transfer · redemption · coupon · custody
│   │   ├── mock/                 # dtc.ts · fedwire.ts · jumio.ts (simulated external systems)
│   │   ├── ledger/               # Canton JSON API client + DAML type bindings
│   │   └── db/                   # PostgreSQL client + schema (investors, holdings, kyc_records, …)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/                # Dashboard · BondMarket · Holdings · Transfer · Login · Register
│   │   ├── pages/admin/          # AdminDashboard · KYCApproval · CustodyManager
│   │   └── components/           # Layout · AdminLayout
│   └── package.json
├── canton/
│   ├── bootstrap.canton          # Canton console bootstrap script
│   └── config/bank-participant.conf
└── daml.yaml                     # SDK 3.4.10, target LF 2.1
```

---

## Running Locally

### Prerequisites

- [DAML SDK 3.4.10](https://docs.daml.com/getting-started/installation.html) — `daml` CLI
- [Node.js 20+](https://nodejs.org/) and npm
- [PostgreSQL 15+](https://www.postgresql.org/)
- Canton Community Edition (for full Canton network; optional for DAML Script tests)

### 1. Compile and test the DAML model

```bash
cd rwa-tokenization

# Compile all 4 modules
daml build

# Run all 39 DAML Script tests (6 privacy tests included)
daml test

# Start the local sandbox (single-participant Canton node)
daml sandbox
```

### 2. Start the Canton JSON API

The backend talks to Canton via its HTTP JSON API. Start it alongside the sandbox:

```bash
# In a separate terminal (sandbox must already be running on port 6865)
daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575
```

### 3. Set up the database and environment

```bash
cd backend
cp .env.example .env
# Edit .env — fill in:
#   DATABASE_URL  (default: postgresql://postgres:postgres@localhost:5432/rwa_platform)
#   JWT_SECRET    (any long random string)
#   BANK_PARTY_ID (printed by bootstrap.canton on first sandbox run, e.g. EscrowBank::122abc...)

psql -U postgres -c "CREATE DATABASE rwa_platform;"
psql -U postgres -d rwa_platform -f src/db/schema.sql
```

### 4. Start the backend

```bash
cd backend
npm install
npm run dev
# API running at http://localhost:3001
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
# UI running at http://localhost:5173
```

### 6. Default credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@rwa-platform.com` | `admin123` |
| Investor | Register via the UI | — |

---

## Testing

39 DAML Script tests across 5 test modules verify correctness at the protocol level — independent of the backend or frontend:

| Module | Count | Coverage |
|---|---|---|
| `KYCTests` | 8 | Invitation flow, approve, renew, revoke, accreditation upgrade, state-machine guards |
| `PurchaseTests` | 8 | Full mint + custody update, two-position accumulation, custody increase, reject, cancel, price-limit guard |
| `RedemptionTests` | 9 | Full atomic redemption, full-custody burn flag, rejection, coupon records (including nonconsuming), guards |
| `TransferTests` | 7 | Full transfer, split transfer, multi-hop transfer history, self-transfer guard, quantity guards |
| `PrivacyTests` | 6 | Investor isolation (A cannot see B's holdings or KYC), regulator visibility of all contracts, 1:1 backing verification |

The privacy tests are the most architecturally significant: they prove that DAML's `signatory`/`observer` model enforces data compartmentalization at the protocol level, not the application level. `queryContractId investor1 bond2Cid` returns `None` — Canton never returns that data to an unauthorized party, regardless of query parameters.

```bash
# Run all tests
daml test

# Run a specific module
daml test --test-pattern "Test.PrivacyTests"
```

---

## API Reference

### Auth (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/register` | Register investor, initiate KYC |
| `POST` | `/login` | Authenticate, receive HttpOnly JWT cookie |
| `POST` | `/logout` | Clear session cookie |

### Investor (`/api/investor`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/kyc` | Get own KYC status |
| `GET` | `/holdings` | List tokenized bond positions |
| `GET` | `/purchases` | List purchase requests |
| `POST` | `/purchases` | Submit new purchase request |
| `POST` | `/holdings/:id/transfer` | Full transfer to another investor |
| `POST` | `/holdings/:id/split-transfer` | Partial transfer (split position) |
| `GET` | `/redemptions` | List redemption requests |
| `POST` | `/holdings/:id/redeem` | Initiate redemption |
| `GET` | `/coupons` | Coupon payment history |

### Admin (`/api/admin`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stats` | Platform dashboard stats |
| `GET` | `/investors` | All investors with KYC status |
| `GET` | `/kyc/pending` | Pending KYC approvals |
| `POST` | `/kyc/:investorId/approve` | Approve KYC |
| `POST` | `/kyc/:investorId/reject` | Reject KYC with reason |
| `GET` | `/bonds` | All custody records |
| `POST` | `/bonds` | Create custody record (record DTC purchase) |
| `GET` | `/purchases/pending` | Pending purchase requests |
| `POST` | `/purchases/:id/approve` | Approve purchase, trigger minting |
| `POST` | `/purchases/:id/reject` | Reject purchase with reason |
| `GET` | `/redemptions/pending` | Pending redemption requests |
| `POST` | `/redemptions/:id/approve` | Approve redemption, burn token |
| `POST` | `/coupons/distribute` | Distribute coupon to all holders of a CUSIP |

### Bonds (`/api/bonds`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Available bonds for purchase |
| `GET` | `/:id` | Bond detail by ID |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Smart contracts | DAML 3.4.10, target LF 2.1 |
| Ledger network | Canton Community Edition |
| Backend | Node.js 20, TypeScript, Express, Zod |
| Database | PostgreSQL 15 |
| Frontend | React 18, Vite, Tailwind CSS |
| Auth | JWT (HttpOnly cookies), bcryptjs |
| Testing | DAML Script (39 tests) |

---

## Industry Context

This project models institutional US Treasury bond tokenization on Canton Network — the workflow major financial institutions are currently building in production for DTC-custodied securities settlement. The core design choices reflect the architecture that matters to institutional participants:

- **Canton Network as settlement layer** — Canton's privacy model allows competing market participants to share a ledger without seeing each other's positions. This codebase demonstrates that model with investor-isolated `TokenizedBond` contracts.
- **DTC as custodian** — The immobilizing custodian of physical securities holds them in its DTC participant account while tokens circulate on Canton. This codebase models that with `CustodyRecord` (the DTC position) and `TokenizedBond` (the circulating token), kept in sync atomically.
- **Regulator as observer** — Institutional tokenization architectures give regulators real-time visibility without operational authority. The `regulator` observer pattern in every material contract reflects this exactly.
- **Atomic DVP** — Eliminating settlement risk through atomic delivery-versus-payment is the central mandate. The minting transaction in this codebase (archive `ApprovedPurchase` + update `CustodyRecord` + create `TokenizedBond` in one DAML transaction) models that guarantee.
