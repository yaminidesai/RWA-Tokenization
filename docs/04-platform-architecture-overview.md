# 04 — Platform Architecture Overview

## Overview

This document describes the high-level architecture of the RWA tokenization platform built on the Canton Network. It covers system components, participant roles, the token lifecycle, Canton node topology, DAML contract modules, off-chain services, and integration points with legacy financial infrastructure.

---

## 1. System Architecture Diagram

```
+===========================================================================+
|                          CANTON NETWORK (PERMISSIONED)                      |
|                                                                            |
|  +---------------------+      Canton Protocol (mTLS)                       |
|  | SYNCHRONIZER NODE   | <-----------------------------------------+      |
|  | (Domain)            | <------+----------+----------+             |      |
|  | Operated by:        |        |          |          |             |      |
|  | Escrow Bank         |        |          |          |             |      |
|  +---------------------+        |          |          |             |      |
|          ^                      |          |          |             |      |
|          |                      |          |          |             |      |
|  +-------+--------+   +--------+---+  +---+--------+  +-----------+-+    |
|  | PARTICIPANT     |   | PARTICIPANT|  | PARTICIPANT|  | PARTICIPANT  |    |
|  | NODE            |   | NODE       |  | NODE       |  | NODE         |    |
|  | Escrow Bank     |   | Bond       |  | Treasury   |  | Regulator    |    |
|  |                 |   | Issuer     |  | Provider   |  | (SEC/OCC)    |    |
|  | - DAML Runtime  |   |            |  |            |  |              |    |
|  | - Ledger API    |   | - DAML     |  | - DAML     |  | - DAML       |    |
|  | - PostgreSQL    |   |   Runtime   |  |   Runtime   |  |   Runtime    |    |
|  +---------+-------+   +------+-----+  +------+-----+  +------+-------+   |
|            |                  |                |                |           |
+============|==================|================|================|===========+
             |                  |                |                |
    +--------+--------+  +-----+------+  +------+------+  +-----+------+
    | OFF-CHAIN       |  | ISSUER     |  | TREASURY    |  | REGULATORY |
    | SERVICES        |  | SYSTEMS    |  | PROVIDER    |  | SYSTEMS    |
    | (Escrow Bank)   |  |            |  | SYSTEMS     |  |            |
    |                 |  | - Bond     |  |             |  | - EDGAR    |
    | - API Gateway   |  |   admin    |  | - DTC/DTCC  |  | - FinCEN   |
    | - KYC Service   |  | - Offering |  | - Fedwire   |  | - OCC      |
    | - Oracle Service|  |   docs     |  | - Bloomberg |  |   Portal   |
    | - Reconciliation|  |            |  | - Custody   |  |            |
    | - Payment Rails |  |            |  |   APIs      |  |            |
    | - Investor      |  |            |  |             |  |            |
    |   Portal (Web)  |  |            |  |             |  |            |
    +-----------------+  +------------+  +-------------+  +------------+
             |
    +--------+--------+
    | INVESTOR         |
    | PARTICIPANT NODE |
    | (or bank-hosted) |
    |                  |
    | - Ledger API     |
    |   access via     |
    |   Investor Portal|
    +------------------+
```

---

## 2. Participant Roles

### 2.1 Role Definitions

| Role | Legal Entity | Canton Representation | Responsibilities |
|------|-------------|----------------------|-----------------|
| **Escrow Bank** | The operating bank (nationally chartered or state-chartered) | Participant Node + Synchronizer Node operator; DAML party `escrowBank` | Platform operator; qualified custodian; signatory on most contracts; holds underlying securities; processes coupon payments and redemptions |
| **Bond Issuer** | US Treasury (for Treasuries) or corporate issuer | Participant Node; DAML party `bondIssuer` | Co-signatory on `TokenizedBond`; authorizes tokenization of specific securities; may delegate to the escrow bank for day-to-day operations |
| **Treasury Provider** | Primary dealer, DTC participant, or custodian bank | Participant Node; DAML party `treasuryProvider` | Executes physical/book-entry purchase/sale of underlying securities; confirms custody; provides corporate actions data |
| **Regulator** | SEC, OCC, FinCEN, or designated regulatory body | Participant Node; DAML party `regulator` | Observer on all material contracts; receives audit trail; can query ledger state for examination purposes |
| **Investor** | Institutional investor, accredited investor, or fund | Participant Node (or bank-hosted on their behalf); DAML party `investor` | Submits purchase and redemption requests; holds tokenized bond ownership; receives coupon payments |

### 2.2 Trust Relationships

```
                    Bond Issuer
                    (co-signs token issuance)
                         |
                         v
Investor --------> Escrow Bank <-------- Treasury Provider
(requests,          (central            (confirms custody,
 transfers,          counterparty;       executes trades)
 redeems)            operates platform)
                         |
                         v
                    Regulator
                    (observes all
                     material contracts)
```

The escrow bank is the central trust anchor. All other parties trust the escrow bank to:

- Hold underlying securities in custody.
- Enforce 1:1 backing between tokens and underlying assets.
- Execute corporate actions (coupons, maturities) accurately.
- Maintain KYC/AML compliance for all token holders.
- Operate the Canton synchronizer honestly and with high availability.

---

## 3. DAML Contract Modules

### 3.1 Module Dependency Diagram

```
RWA.Types
    ^
    |
    +--- RWA.KYC
    |       ^
    |       |
    +--- RWA.EscrowRequest --------+
    |       |                       |
    |       v                       |
    +--- RWA.AssetCustody           |
    |       |                       |
    |       v                       |
    +--- RWA.TokenizedBond <--------+
    |       |       |
    |       |       +--- RWA.CouponPayment
    |       |
    |       +--- RWA.RedemptionRequest
    |
    +--- RWA.Util
```

### 3.2 Module Descriptions

#### RWA.Types

Shared type definitions used across all modules.

```daml
module RWA.Types where

-- KYC status enumeration
data KYCStatus = Pending | Approved | Rejected | Revoked
  deriving (Eq, Show)

-- Bond type enumeration
data BondType = TBill | TNote | TBond | TIPS | FRN | Corporate | Municipal
  deriving (Eq, Show)

-- Coupon frequency
data CouponFrequency = Monthly | Quarterly | SemiAnnual | Annual | ZeroCoupon
  deriving (Eq, Show)

-- Currency (ISO 4217)
type Currency = Text

-- Identifiers
type Isin = Text    -- 12-character ISIN
type Cusip = Text   -- 9-character CUSIP

-- Face value with currency
data MonetaryAmount = MonetaryAmount
  with
    amount : Decimal
    currency : Currency
  deriving (Eq, Show)
```

#### RWA.KYC

Manages investor identity verification and compliance status.

- **Template**: `KYCRecord`
- **Signatories**: `regulator`, `escrowBank`
- **Observers**: `investor`
- **Key**: `(regulator, investor)` — one active KYC record per investor per regulator
- **Choices**: `ApproveKYC`, `RevokeKYC`, `RenewKYC`

#### RWA.EscrowRequest

Captures an investor's intent to purchase tokenized bonds.

- **Template**: `EscrowRequest`
- **Signatories**: `investor`, `escrowBank`
- **Observers**: `regulator`
- **Choices**:
  - `ApproveRequest` (controller: `escrowBank`) -- creates `CustodyInstruction`
  - `RejectRequest` (controller: `escrowBank`)
  - `CancelRequest` (controller: `investor`)

#### RWA.AssetCustody

Manages the custody workflow between the escrow bank and the treasury provider.

- **Templates**: `CustodyInstruction`, `CustodyConfirmation`
- **Signatories**: `escrowBank`, `treasuryProvider`
- **Observers**: `regulator`, `bondIssuer`
- **Choices**:
  - `ConfirmCustody` (controller: `treasuryProvider`) -- creates `CustodyConfirmation` and triggers minting
  - `RejectCustody` (controller: `treasuryProvider`)

#### RWA.TokenizedBond

The core token contract representing ownership of the underlying bond.

- **Template**: `TokenizedBond`
- **Signatories**: `escrowBank`, `bondIssuer`
- **Observers**: `currentOwner`, `regulator`, `treasuryProvider`
- **Key**: `(escrowBank, bondIsin, currentOwner)`
- **Choices**:
  - `TransferOwnership` (controller: `currentOwner`, `escrowBank`) -- enforces KYC, creates new bond with updated owner
  - `PayCoupon` (controller: `escrowBank`) -- records coupon payment, creates `CouponPayment`
  - `RedeemBond` (controller: `currentOwner`) -- initiates redemption at maturity, creates `RedemptionRequest`

#### RWA.CouponPayment

Immutable record of each coupon payment.

- **Template**: `CouponPayment`
- **Signatories**: `escrowBank`
- **Observers**: `currentOwner`, `regulator`, `bondIssuer`

#### RWA.RedemptionRequest

Manages the bond redemption workflow at or after maturity.

- **Template**: `RedemptionRequest`
- **Signatories**: `investor`, `escrowBank`
- **Observers**: `regulator`
- **Choices**:
  - `ApproveRedemption` (controller: `escrowBank`) -- triggers burn of `TokenizedBond`, initiates fiat payout
  - `RejectRedemption` (controller: `escrowBank`)

---

## 4. Token Lifecycle

### 4.1 Lifecycle Phases

```
Phase 1          Phase 2           Phase 3            Phase 4
KYC/AML    -->   Purchase     -->  Custody       -->  Token
Onboarding       Request           Acquisition        Minting

Phase 5          Phase 6
Coupon      -->  Maturity &
Payments         Redemption
```

### 4.2 Detailed Sequence Diagram

```
    Investor        Escrow Bank     Treasury Provider    Bond Issuer     Regulator
       |                |                  |                  |               |
       |  PHASE 1: KYC/AML ONBOARDING                                       |
       |--------------->|                  |                  |               |
       | Submit KYC docs|                  |                  |               |
       |                |--[KYC API]------>|                  |               |
       |                | Verify identity  |                  |               |
       |                |<-[KYC result]----|                  |               |
       |                |                  |                  |               |
       |                |---- Create KYCRecord (DAML) ------->|               |
       |                |  signatory: regulator, escrowBank   |               |
       |                |  observer: investor                 |               |
       |<--KYC Approved-|                  |                  |               |
       |                |                  |                  |               |
       |  PHASE 2: PURCHASE REQUEST                                          |
       |--------------->|                  |                  |               |
       | Create         |                  |                  |               |
       | EscrowRequest  |                  |                  |               |
       |  (DAML)        |                  |                  |               |
       |                |                  |                  |               |
       |                |---[Validate KYC, credit check]----->|               |
       |                |                  |                  |               |
       |                |--Exercise        |                  |               |
       |                |  ApproveRequest  |                  |               |
       |                |  (DAML)          |                  |               |
       |                |                  |                  |               |
       |  PHASE 3: CUSTODY ACQUISITION                                       |
       |                |--Create          |                  |               |
       |                |  CustodyInstruction                 |               |
       |                |  (DAML)--------->|                  |               |
       |                |                  |                  |               |
       |                |  [Off-chain: Treasury Provider      |               |
       |                |   purchases bond via DTC/Fedwire]   |               |
       |                |                  |                  |               |
       |                |                  |--Exercise        |               |
       |                |                  |  ConfirmCustody  |               |
       |                |<-CustodyConfirmation (DAML)         |               |
       |                |                  |                  |               |
       |  PHASE 4: TOKEN MINTING                                             |
       |                |--Create          |                  |               |
       |                |  TokenizedBond   |                  |               |
       |                |  (DAML)          |                  |               |
       |                |  signatory: escrowBank, bondIssuer  |               |
       |                |  observer: investor, regulator,     |               |
       |                |           treasuryProvider           |               |
       |<--Bond Minted--|                  |                  |               |
       |                |                  |                  |               |
       |  PHASE 5: COUPON PAYMENT (periodic)                                 |
       |                |                  |                  |               |
       |                |<-[DTC coupon     |                  |               |
       |                |   payment recv'd]|                  |               |
       |                |                  |                  |               |
       |                |--Exercise PayCoupon (DAML)          |               |
       |                |  Creates CouponPayment record       |               |
       |                |                  |                  |               |
       |                |--[ACH/Fedwire]-->|                  |               |
       |<--Coupon paid--|  fiat to investor|                  |               |
       |                |                  |                  |               |
       |  PHASE 6: MATURITY & REDEMPTION                                     |
       |--------------->|                  |                  |               |
       | Exercise       |                  |                  |               |
       | RedeemBond     |                  |                  |               |
       | (DAML)         |                  |                  |               |
       |                |--Create          |                  |               |
       |                |  RedemptionRequest|                 |               |
       |                |  (DAML)          |                  |               |
       |                |                  |                  |               |
       |                |--Exercise        |                  |               |
       |                |  ApproveRedemption|                 |               |
       |                |  (DAML)          |                  |               |
       |                |                  |                  |               |
       |                |--[TokenizedBond archived/burned]    |               |
       |                |                  |                  |               |
       |                |<-[Maturity       |                  |               |
       |                |   proceeds from  |                  |               |
       |                |   DTC/Fedwire]   |                  |               |
       |                |                  |                  |               |
       |                |--[Fedwire/ACH]-->|                  |               |
       |<--Principal    |  fiat to investor|                  |               |
       |   returned     |                  |                  |               |
       |                |                  |                  |               |
```

### 4.3 State Machine

```
                              +-------------------+
                              |   KYCRecord       |
                              |   (Approved)      |
                              +--------+----------+
                                       |
                                       | Investor submits request
                                       v
                              +-------------------+
                              |  EscrowRequest    |
                              |  (Pending)        |
                              +--------+----------+
                                /      |       \
                    CancelRequest  ApproveRequest  RejectRequest
                        |              |               |
                        v              v               v
                    [Archived]  +------+--------+  [Archived]
                                | CustodyInstruction|
                                | (Pending)         |
                                +------+------------+
                                  /          \
                          ConfirmCustody  RejectCustody
                              |               |
                              v               v
                    +---------+------+    [Archived]
                    |CustodyConfirmation|
                    +--------+-------+
                             |
                             | Mint token
                             v
                    +--------+--------+
                    | TokenizedBond   |
                    | (Active)        |
                    +---+----+----+---+
                        |    |    |
             TransferOwnership  |  RedeemBond
                  |        PayCoupon    |
                  v           |        v
         +--------+--------+ | +------+----------+
         | TokenizedBond   | | | RedemptionRequest|
         | (new owner)     | | | (Pending)        |
         +-----------------+ | +------+-----------+
                             |        |
                             v   ApproveRedemption
                    +---------+--+    |
                    |CouponPayment|   v
                    |(Record)     | [TokenizedBond Archived]
                    +-------------+ [Fiat returned to investor]
```

---

## 5. Off-Chain Services Architecture

### 5.1 Service Components

```
+================================================================+
|                    OFF-CHAIN SERVICES LAYER                      |
|                    (Operated by Escrow Bank)                     |
|                                                                  |
|  +------------------+  +------------------+  +----------------+ |
|  | API Gateway       |  | Investor Portal  |  | Admin Portal   | |
|  | (Kong/Envoy)      |  | (React/Next.js)  |  | (Internal)     | |
|  +--------+---------+  +--------+---------+  +-------+--------+ |
|           |                      |                     |         |
|           v                      v                     v         |
|  +--------+---------------------+---------------------+--------+|
|  |              APPLICATION SERVICE LAYER                       ||
|  |                                                              ||
|  |  +--------------+  +--------------+  +--------------+        ||
|  |  | KYC Service  |  | Escrow       |  | Custody      |        ||
|  |  | - Onboarding |  | Service      |  | Service      |        ||
|  |  | - Screening  |  | - Request    |  | - Instruction|        ||
|  |  | - Monitoring |  |   mgmt       |  | - Confirm    |        ||
|  |  +--------------+  +--------------+  +--------------+        ||
|  |                                                              ||
|  |  +--------------+  +--------------+  +--------------+        ||
|  |  | Minting      |  | Coupon       |  | Redemption   |        ||
|  |  | Service      |  | Service      |  | Service      |        ||
|  |  | - Token      |  | - Schedule   |  | - Maturity   |        ||
|  |  |   creation   |  | - Payment    |  |   monitor    |        ||
|  |  +--------------+  +--------------+  +--------------+        ||
|  |                                                              ||
|  |  +--------------+  +--------------+  +--------------+        ||
|  |  | Reconciliation| | Oracle       |  | Notification |        ||
|  |  | Service      |  | Service      |  | Service      |        ||
|  |  | - Daily recon|  | - Market data|  | - Email/SMS  |        ||
|  |  | - Proof of   |  | - Corp actions| | - Webhooks   |        ||
|  |  |   reserves   |  | - Reference  |  |              |        ||
|  |  +--------------+  |   data       |  +--------------+        ||
|  |                     +--------------+                         ||
|  +--------------------------------------------------------------+|
|           |                                                      |
|           v                                                      |
|  +------------------+                                            |
|  | Canton Ledger    |                                            |
|  | API Client       |                                            |
|  | (gRPC, port 6865)|                                            |
|  +------------------+                                            |
+================================================================+
```

### 5.2 Service Descriptions

| Service | Responsibility | Trigger | External Dependencies |
|---------|---------------|---------|----------------------|
| **KYC Service** | Manages investor onboarding, identity verification, sanctions screening | Investor registration via portal | KYC provider API (Jumio/Onfido), sanctions screening API (LexisNexis) |
| **Escrow Service** | Manages purchase requests, validates investor eligibility, routes to custody | `EscrowRequest` creation on ledger | Internal credit check systems |
| **Custody Service** | Submits trade instructions to treasury provider, receives confirmations | `CustodyInstruction` creation on ledger | Treasury provider API, DTC/Fedwire |
| **Minting Service** | Creates `TokenizedBond` contracts after custody confirmation | `CustodyConfirmation` creation on ledger | None (ledger-only) |
| **Coupon Service** | Monitors coupon schedules, triggers `PayCoupon`, initiates fiat payments | DTC corporate action notifications, schedule timer | Payment rails (ACH/Fedwire), DTC corporate actions API |
| **Redemption Service** | Monitors maturity dates, processes redemption requests, triggers `BurnToken` | `RedemptionRequest` creation on ledger, maturity date reached | Payment rails (Fedwire), DTC maturity processing |
| **Reconciliation Service** | Compares on-ledger token supply with custodial holdings | Daily schedule (or more frequent) | DTC position API, Fedwire Securities balance query |
| **Oracle Service** | Feeds market data, reference data, and corporate actions to the ledger | Schedule or event-driven | Bloomberg/Refinitiv API, CUSIP Global Services |
| **Notification Service** | Sends notifications to investors and internal stakeholders | Contract events on ledger | Email/SMS gateway, webhook endpoints |

### 5.3 Event-Driven Architecture

The off-chain services subscribe to the Canton Ledger API's transaction stream to react to on-ledger events:

```
Canton Ledger API
    |
    | gRPC Transaction Stream (GetTransactionTrees / GetTransactions)
    |
    v
+---+--------------------+
| Event Router           |
| (Kafka / RabbitMQ /    |
|  direct gRPC consumer) |
+---+---+---+---+---+----+
    |   |   |   |   |
    v   v   v   v   v
  KYC Escrow Custody Coupon Redemption
  Svc  Svc   Svc    Svc    Svc
```

Each service filters for the DAML contract types and events it cares about:

| Event | Service | Action |
|-------|---------|--------|
| `KYCRecord` created with status `Approved` | Escrow Service | Enable investor for purchase requests |
| `EscrowRequest` created | Escrow Service | Validate and route to approval |
| `CustodyInstruction` created | Custody Service | Submit trade order to treasury provider |
| `CustodyConfirmation` created | Minting Service | Create `TokenizedBond` |
| `TokenizedBond` created | Notification Service | Notify investor of token receipt |
| `CouponPayment` created | Notification Service | Notify investor of coupon payment |
| `RedemptionRequest` created | Redemption Service | Process redemption, sell/mature underlying |

---

## 6. Integration Points with Legacy Financial Infrastructure

### 6.1 Integration Map

```
+-------------------+          +-------------------+
|   CANTON NETWORK  |          | LEGACY FINANCIAL  |
|   (On-Ledger)     |          | INFRASTRUCTURE    |
+-------------------+          +-------------------+

TokenizedBond mint  --------->  DTC DVP buy
                                (SWIFT MT541/MT543)

TokenizedBond burn  --------->  DTC DVP sell
                                (SWIFT MT542/MT540)

PayCoupon           <---------  DTC Corporate Action
                                (coupon payment received
                                 via Fedwire Funds)

PayCoupon           --------->  ACH / Fedwire Funds
                                (distribute to investor
                                 bank account)

RedeemBond          <---------  DTC Maturity Processing
                                (principal returned via
                                 Fedwire Funds)

RedeemBond          --------->  Fedwire Funds
                                (pay investor)

KYCRecord           <---------  KYC Provider API
                                (Jumio, Onfido)

KYCRecord           <---------  Sanctions Screening API
                                (OFAC, WorldCompliance)

Reconciliation      <---------  DTC Position API
                                Fedwire Securities Balance
```

### 6.2 Integration Specifications

#### 6.2.1 DTC / DTCC Integration

| Aspect | Specification |
|--------|--------------|
| **Protocol** | SWIFT FIN (MT5xx messages) or DTCC's proprietary APIs |
| **Authentication** | SWIFT PKI (RMA key exchange) or DTCC certificate-based auth |
| **Message types** | MT540 (Receive Free), MT541 (Receive Against Payment), MT542 (Deliver Free), MT543 (Deliver Against Payment), MT535 (Statement of Holdings), MT536 (Statement of Transactions) |
| **Settlement instruction flow** | Off-chain Custody Service sends MT541 (buy) or MT543 (sell) to DTC via SWIFT. DTC settles DVP. DTC sends MT544/MT545/MT546/MT547 (confirmations) back. |
| **Corporate actions** | DTC sends MT564 (Corporate Action Notification) for coupons and maturities. Off-chain Coupon Service processes these and triggers DAML `PayCoupon`. |
| **Position reconciliation** | Off-chain Reconciliation Service queries DTC MT535 (Statement of Holdings) daily and compares with on-ledger token supply. |
| **Error handling** | Failed settlement instructions generate SWIFT MT548 (Settlement Status and Processing Advice). The Custody Service must handle these and update the on-ledger `CustodyInstruction` accordingly. |

#### 6.2.2 Fedwire Securities Integration

| Aspect | Specification |
|--------|--------------|
| **Protocol** | Fedwire Securities Service (proprietary protocol via FedLine Direct or FedLine Advantage) |
| **Authentication** | PKI certificates issued by the Federal Reserve |
| **Message types** | Original transfer (deliver/receive securities), reversal, pledge/release |
| **Settlement** | Real-time DVP (securities and funds settle simultaneously) |
| **Reconciliation** | Daily securities balance statement from the Federal Reserve Bank |

#### 6.2.3 Payment Rails Integration

| Payment Rail | Protocol | Use Case | Integration Method |
|-------------|----------|----------|-------------------|
| **Fedwire Funds** | FedLine Direct, ISO 20022 (migration in progress) | Large-value payments: bond purchases, redemption payouts | Direct FedLine integration or via correspondent bank |
| **ACH** | NACHA file format, SFTP upload to originating bank | Coupon payments to investor bank accounts | NACHA file generation, batch submission |
| **SWIFT gpi** | SWIFT FIN (MT103, MT202) or ISO 20022 (pacs.008, pacs.009) | Cross-border payments to international investors | SWIFT Alliance Gateway or SWIFT Service Bureau |

#### 6.2.4 KYC/AML Provider Integration

| Aspect | Specification |
|--------|--------------|
| **Protocol** | REST API over HTTPS |
| **Authentication** | OAuth 2.0 (client credentials grant) or API key |
| **Endpoints** | `POST /verifications` (initiate), `GET /verifications/{id}` (check status), webhook for asynchronous results |
| **Data flow** | Investor Portal collects identity documents and sends to KYC Service. KYC Service calls provider API. On "pass" result, KYC Service creates `KYCRecord` on Canton ledger. |
| **Sanctions screening** | Separate API call to sanctions screening provider. Must be called at onboarding and at every `TransferOwnership` exercise. |
| **SLA** | Identity verification: < 5 minutes (automated), < 24 hours (manual review). Sanctions screening: < 2 seconds. |

#### 6.2.5 Market Data / Reference Data Integration

| Data Source | Protocol | Data | Frequency |
|------------|----------|------|-----------|
| Bloomberg (B-PIPE / BLPAPI) | Proprietary TCP | Treasury prices, yields, analytics | Real-time or EOD |
| Refinitiv (Elektron / TREP) | Proprietary TCP or REST | Treasury prices, yields, reference data | Real-time or EOD |
| CUSIP Global Services | REST API or batch file | CUSIP assignments, reference data | On demand or daily |
| Federal Reserve (H.15) | REST API (FRED) | Treasury constant maturity rates | Daily |

---

## 7. Security Architecture

### 7.1 Network Security

```
+------------------+     +-------------------+     +------------------+
|  PUBLIC INTERNET |     |       DMZ         |     |  INTERNAL NETWORK|
|                  |     |                   |     |                  |
|  Investor        |---->| API Gateway       |---->| Application      |
|  Browser/App     |     | (TLS termination, |     | Services         |
|                  |     |  WAF, rate limit)  |     |                  |
+------------------+     +-------------------+     +--------+---------+
                                                           |
                                                           v
                                                   +-------+--------+
                                                   | Canton Nodes   |
                                                   | (mTLS, network |
                                                   |  segmented)    |
                                                   +-------+--------+
                                                           |
                                                           v
                                                   +-------+--------+
                                                   | HSM Cluster    |
                                                   | (Air-gapped    |
                                                   |  management)   |
                                                   +----------------+
```

### 7.2 Authentication and Authorization

| Layer | Method | Details |
|-------|--------|---------|
| Investor Portal | OAuth 2.0 + MFA | OpenID Connect with identity provider; hardware token or authenticator app for MFA |
| API Gateway | JWT validation + mTLS | JWT tokens issued by the identity provider; mTLS for service-to-service |
| Canton Ledger API | mTLS + JWT | Client certificate for service identity; JWT for DAML party authorization |
| Canton Admin API | mTLS + RBAC | Client certificate + role-based access control; restricted to ops team |
| HSM | M-of-N authentication | Smart card or PIN-based multi-person authentication for key operations |

### 7.3 Data Encryption

| Data State | Method | Standard |
|-----------|--------|----------|
| In transit (external) | TLS 1.3 | NIST SP 800-52 Rev 2 |
| In transit (Canton protocol) | mTLS (TLS 1.3) | Canton protocol specification |
| At rest (database) | AES-256 (Transparent Data Encryption) | NIST SP 800-111 |
| At rest (backups) | AES-256 with HSM-managed keys | NIST SP 800-111 |
| At rest (logs) | AES-256 | NIST SP 800-111 |
| Cryptographic signing (DAML) | ECDSA P-256 or Ed25519 (via HSM) | NIST SP 800-186 |

---

## 8. Scalability and Performance

### 8.1 Expected Throughput

| Metric | Target | Rationale |
|--------|--------|-----------|
| Token minting | 50 TPS sustained | Supports batch issuance of tokenized bonds |
| Token transfers | 100 TPS sustained | Supports active secondary market |
| Coupon payments | 1,000 per batch (within 10 minutes) | Bulk coupon distribution |
| Concurrent investors | 10,000 active | Initial platform capacity |
| Ledger API query latency (p99) | < 500ms | Investor portal responsiveness |
| Command submission latency (p99) | < 2 seconds | Acceptable for securities transactions |

### 8.2 Scaling Strategy

- **Vertical scaling**: Increase CPU/RAM on participant and synchronizer nodes for higher throughput.
- **Read replicas**: Deploy read-only Ledger API instances backed by PostgreSQL read replicas for query-heavy workloads (investor portal, reporting).
- **Horizontal scaling (future)**: Canton supports multiple synchronizer domains. As volume grows, partition by asset class or geography into separate domains with cross-domain transactions where needed.
- **Off-chain service scaling**: Stateless microservices behind a load balancer; scale horizontally based on event volume.

---

## 9. Regulatory and Compliance Architecture

### 9.1 Audit Trail

The platform produces a complete, tamper-evident audit trail through:

1. **Canton ledger**: Every DAML contract creation and exercise is recorded in the Canton ledger with transaction ID, timestamp, parties, and contract data. The regulator, as an observer on material contracts, has full visibility.

2. **Off-chain audit logs**: All API calls, business decisions, and integration events are logged in structured format and shipped to the SIEM.

3. **Reconciliation reports**: Daily reconciliation results are stored and available for examiner review.

### 9.2 Regulator Access

The regulator's participant node provides:

- **Real-time view**: The regulator can query the Ledger API to see all contracts where they are an observer (which includes all material contracts on this platform).
- **Historical view**: The regulator can query the transaction stream to see all historical contract events.
- **Export**: The regulator can export contract data in standard formats (JSON, CSV) for analysis in their own systems.
- **No write access**: The regulator is never a signatory or controller on any contract — they cannot modify ledger state.

### 9.3 Reporting Outputs

| Report | Frequency | Format | Destination |
|--------|-----------|--------|-------------|
| Token issuance/burn report | Daily | CSV / JSON | Compliance team, regulator (on request) |
| Holder report (cap table) | Daily | CSV / JSON | Compliance team, transfer agent records |
| Coupon payment report | Per payment event | CSV / JSON | Accounting, tax reporting |
| AML transaction monitoring alerts | Real-time | Alert / ticket | BSA officer |
| Reconciliation report | Daily | PDF / JSON | Operations, compliance, auditors |
| Regulatory filing data | Per filing schedule | EDGAR XML, FinCEN BSA E-Filing | SEC, FinCEN |
