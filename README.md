# RWA - Tokenization

> This project models institutional US Treasury bond tokenization on Canton Network — the workflow major financial institutions are currently building in production for DTC-custodied securities settlement.

---

## Overview

This platform implements the complete lifecycle of a tokenized US Treasury security on Canton Network:

- **Investor onboarding** — KYC/AML clearance with accreditation gating (Retail / Accredited / QP / QIB)
- **Custody attestation** — the escrow bank creates an on-ledger `CustodyRecord` attesting to its DTC position
- **Atomic minting** — `TokenizedBond` tokens are minted strictly 1:1 against that custody; the DAML runtime enforces the invariant at every transaction
- **Compliant transfer** — peer-to-peer transfers require both investor consent and bank co-authorization (KYC, OFAC, Reg D)
- **Income and redemption** — semiannual coupon distribution and principal redemption with immutable on-chain audit records

DAML functions here as a formal authorization framework, not merely a smart-contract language. The 9 templates encode who can authorize what, who can observe what, and what invariants must hold — machine-checked at every transaction submission.

---

## Why This Matters

Current US Treasury settlement runs on T+1, routing through at least three separate ledgers: the issuer (TreasuryDirect / Fedwire Securities), the central securities depository (DTC), and broker/dealer position records. Nightly reconciliation across these systems costs the industry billions annually and introduces fail risk estimated at 2–3% of daily settlement volume.

A Canton-based tokenization layer solves this by making the custody record and the token positions the **same** ledger. The design properties that matter to institutional participants:

- **Privacy by protocol, not policy.** DAML's signatory/observer model means Investor A literally cannot query Investor B's holdings at the protocol level — no ACL configuration can accidentally expose them. This is what makes Canton viable for a consortium of competing banks.
- **Atomic settlement.** Token creation and custody position update happen in a single DAML transaction. There is no window where a token exists without backing, or backing is recorded without a token.
- **Regulator visibility without authority.** The `regulator` party observes every material contract — positions, KYC status, custody backing — but cannot unilaterally exercise any choice. This mirrors how regulators receive reporting without having operational access to custodian systems.
- **Compliance in logic, not configuration.** Transfer requires investor consent and bank co-authorization. The bank's off-chain Transfer Service verifies KYC, OFAC, Reg D, and accreditation before co-signing. If any check fails, the on-chain transaction is never submitted.

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

The backend is an orchestration layer only — it submits DAML commands to the ledger and projects ledger events into PostgreSQL for query performance. All business rules (1:1 backing, KYC gating, transfer authorization, price limits) live in the DAML model where they are machine-enforced.

---

## DAML Contract Model

Nine templates across four modules implement the full workflow:

### `RWA.AssetCustody` — Custody Position

| Template | Signatories | Observers | Purpose |
| --- | --- | --- | --- |
| `CustodyRecord` | `escrowBank` | `regulator` | On-ledger attestation of bonds held at DTC; enforces `totalMintedUnits ≤ quantity` at the protocol level |

The `ensure` clause on `CustodyRecord` is the foundation of 1:1 backing: `totalMintedUnits <= quantity` is checked by the DAML runtime on every contract creation and update — not by application logic that could be bypassed.

### `RWA.KYC` — Investor Compliance

| Template | Signatories | Observers | Purpose |
| --- | --- | --- | --- |
| `KYCInvitation` | `escrowBank` | `investor`, `regulator` | Bank initiates onboarding; investor acceptance triggers off-chain identity verification |
| `InvestorKYC` | `escrowBank` | `investor`, `regulator` | Active KYC certificate — AML clearance, OFAC screening, accreditation level, expiry, and provider reference |

The bank is the sole signatory on `InvestorKYC` because KYC is a regulatory determination made by the bank, not a mutual agreement. Choices: `ApproveKYC`, `RevokeKYC`, `RenewKYC`, `UpdateAccreditation`.

### `RWA.EscrowRequest` — Purchase Settlement

| Template | Signatories | Observers | Purpose |
| --- | --- | --- | --- |
| `EscrowRequest` | `escrowBank`, `investor` | `regulator` | Purchase intent; investor's `maxPurchasePrice` is binding — `ConfirmCustodyAndMint` fails if actual price exceeds it |
| `ApprovedPurchase` | `escrowBank`, `investor` | `regulator` | Bank approved; awaiting DTC settlement (MT545) and off-chain bond purchase (SWIFT MT541) |
| `RejectedRequest` | `escrowBank`, `investor` | `regulator` | Immutable audit record of any rejected or cancelled request |

The purchase flow models real delivery-versus-payment: `ConfirmCustodyAndMint`, `RecordMinting`, and `TokenizedBond` creation execute atomically in a single DAML transaction. No token is ever created without confirmed DTC settlement.

### `RWA.TokenizedBond` — The Token

| Template | Signatories | Observers | Purpose |
| --- | --- | --- | --- |
| `TokenizedBond` | `escrowBank` | `currentOwner`, `regulator` | Investor's on-ledger ownership position; carries `dtcSettlementRef` linking to the DTC settlement event |
| `CouponPaymentRecord` | `escrowBank` | `investor`, `regulator` | Immutable coupon payment receipt with ACH trace / Fedwire IMAD reference |
| `RedemptionRequest` | `escrowBank`, `investor` | `regulator` | Co-signed redemption; `ApproveRedemption` + `BurnToken` + `CustodyRecord.RecordRedemption` execute atomically |

Transfer requires **both** `currentOwner` and `escrowBank` as controllers — the investor must consent and the bank must co-sign after verifying KYC/OFAC/Reg D. Neither party alone can move a position.

---

## Security and Compliance Controls

These controls are enforced by the DAML runtime, not by application code that could be misconfigured:

| Control | Where Enforced | Regulatory Basis |
| --- | --- | --- |
| No token minted without DTC custody backing | `CustodyRecord.ensure: totalMintedUnits ≤ quantity` | Qualified custodian / 1:1 backing |
| No transfer without bank co-authorization | `TransferOwnership controller: currentOwner, escrowBank` | KYC/OFAC/Reg D compliance gate |
| No self-transfer | `assertMsg "Cannot transfer to self"` | Wash trade prevention |
| No split exceeding position | `assertMsg "Cannot transfer more than owned"` | Position integrity |
| No redemption without investor initiation | `InitiateRedemption controller: currentOwner` | Investor consent |
| KYC state machine enforced | `ApproveKYC` asserts `KYCPending`; `RevokeKYC` asserts `KYCApproved` | Prevents illegal state transitions |
| Investor A cannot see Investor B's data | DAML signatory/observer model | Competitive confidentiality |
| Price slippage protection | `ConfirmCustodyAndMint` asserts `actualPrice ≤ maxPurchasePrice` | Best execution |
| Immutable transfer audit trail | `transferHistory` field append-only | SEC Rule 17a-4 recordkeeping |

---

## Testing

39 DAML Script tests verify correctness at the protocol level — independent of the backend or frontend:

| Module | Tests | Coverage |
| --- | --- | --- |
| `KYCTests` | 8 | Invitation flow, approve, renew, revoke, accreditation upgrade, state-machine guards |
| `PurchaseTests` | 8 | Full mint + custody update, two-position accumulation, custody increase, reject, cancel, price-limit guard |
| `RedemptionTests` | 9 | Full atomic redemption, full-custody burn flag, rejection, coupon records, guards |
| `TransferTests` | 7 | Full transfer, split transfer, multi-hop transfer history, self-transfer guard, quantity guards |
| `PrivacyTests` | 6 | Investor isolation, regulator visibility across all contracts, 1:1 backing verification |

The privacy tests are architecturally significant: `queryContractId investor1 bond2Cid` returns `None` — Canton never returns data to an unauthorized party regardless of query parameters. This proves DAML's privacy model operates at the protocol level, not the application level.

```bash
daml test                                        # run all 39 tests
daml test --test-pattern "Test.PrivacyTests"     # run a specific module
```

---

## Technology Stack

| Layer | Technology |
| --- | --- |
| Smart contracts | DAML 3.4.10, target LF 2.1 |
| Ledger network | Canton Community Edition |
| Backend | Node.js 20, TypeScript, Express, Zod |
| Database | PostgreSQL 15 |
| Frontend | React 18, Vite, Tailwind CSS |
| Auth | JWT (HttpOnly cookies), bcryptjs |
| Testing | DAML Script (39 tests) |

---

## Running Locally

### Prerequisites

- [DAML SDK 3.4.10](https://docs.daml.com/getting-started/installation.html)
- Node.js 20+ and npm
- PostgreSQL 15+
- Canton Community Edition (optional for DAML Script tests; required for full network)

### 1. Build and test the DAML model

```bash
daml build       # compile all 4 modules
daml test        # run all 39 DAML Script tests
daml sandbox     # start local single-participant Canton node
```

### 2. Start the Canton JSON API

```bash
# separate terminal — sandbox must be running on port 6865
daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575
```

### 3. Configure the database

```bash
cd backend
cp .env.example .env
# set DATABASE_URL, JWT_SECRET, and BANK_PARTY_ID in .env

psql -U postgres -c "CREATE DATABASE rwa_platform;"
psql -U postgres -d rwa_platform -f src/db/schema.sql
```

### 4. Start the backend

```bash
cd backend && npm install && npm run dev
# API at http://localhost:3001
```

### 5. Start the frontend

```bash
cd frontend && npm install && npm run dev
# UI at http://localhost:5173
```

---

## API Reference

### Auth — `/api/auth`

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/register` | Register investor, initiate KYC |
| `POST` | `/login` | Authenticate, receive HttpOnly JWT cookie |
| `POST` | `/logout` | Clear session |

### Investor — `/api/investor`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/kyc` | Own KYC status |
| `GET` | `/holdings` | Tokenized bond positions |
| `GET` | `/purchases` | Purchase request history |
| `POST` | `/purchases` | Submit purchase request |
| `POST` | `/holdings/:id/transfer` | Full position transfer |
| `POST` | `/holdings/:id/split-transfer` | Partial transfer (split position) |
| `GET` | `/redemptions` | Redemption request history |
| `POST` | `/holdings/:id/redeem` | Initiate redemption |
| `GET` | `/coupons` | Coupon payment history |

### Admin — `/api/admin`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/stats` | Platform dashboard metrics |
| `GET` | `/investors` | All investors with KYC status |
| `GET` | `/kyc/pending` | Pending KYC queue |
| `POST` | `/kyc/:investorId/approve` | Approve KYC |
| `POST` | `/kyc/:investorId/reject` | Reject KYC with reason |
| `GET` | `/bonds` | All custody records |
| `POST` | `/bonds` | Create custody record |
| `GET` | `/purchases/pending` | Pending purchase queue |
| `POST` | `/purchases/:id/approve` | Approve and mint |
| `POST` | `/purchases/:id/reject` | Reject purchase |
| `GET` | `/redemptions/pending` | Pending redemption queue |
| `POST` | `/redemptions/:id/approve` | Approve redemption, burn token |
| `POST` | `/coupons/distribute` | Distribute coupon to all CUSIP holders |

### Bonds — `/api/bonds`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Available bonds |
| `GET` | `/:id` | Bond detail |

---

## Project Structure

```
rwa-tokenization/
├── daml/
│   ├── RWA/
│   │   ├── Types.daml            # Enums and shared value types
│   │   ├── AssetCustody.daml     # CustodyRecord: DTC position + 1:1 backing invariant
│   │   ├── KYC.daml              # InvestorKYC + KYCInvitation
│   │   ├── EscrowRequest.daml    # Purchase settlement workflow
│   │   └── TokenizedBond.daml    # Token, coupon records, redemption
│   └── Test/
│       ├── Setup.daml
│       ├── KYCTests.daml
│       ├── PurchaseTests.daml
│       ├── RedemptionTests.daml
│       ├── TransferTests.daml
│       └── PrivacyTests.daml
├── backend/
│   └── src/
│       ├── api/middleware/       # JWT auth, audit logging, error handling
│       ├── api/routes/           # auth · investor · bonds · admin
│       ├── services/             # kyc · purchase · transfer · redemption · coupon · custody
│       ├── mock/                 # simulated DTC, Fedwire, Jumio integrations
│       ├── ledger/               # Canton JSON API client + DAML bindings
│       └── db/                   # PostgreSQL client + schema
├── frontend/
│   └── src/
│       ├── pages/                # Dashboard · BondMarket · Holdings · Transfer
│       └── pages/admin/          # AdminDashboard · KYCApproval · CustodyManager
├── canton/
│   ├── bootstrap.canton
│   └── config/bank-participant.conf
└── daml.yaml                     # SDK 3.4.10, target LF 2.1
```
