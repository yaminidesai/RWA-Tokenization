# 03 — Developer Requirements

## Overview

This document defines the technical and compliance requirements for developers building, deploying, and maintaining the RWA tokenization platform on the Canton Network. It covers Canton node setup, DAML contract development standards, security requirements, integration specifications, key management, testing, deployment, and incident response.

**Architecture summary for developers**:
- The bank operates **one Canton participant node** — this is the only Canton infrastructure the bank owns.
- The bank's participant node connects to the **Canton Global Synchronizer** (operated by the Canton Network's super-validator consortium). The bank does NOT operate a synchronizer.
- All parties (`escrowBank` and all investor parties) are hosted on this single participant node.
- Bond issuers, treasury providers, and regulators are NOT Canton participants. They are off-chain integration targets.
- DAML target is LF 2.1 (`--target=2.1`). Contract keys are not supported in LF 2.1; off-chain services use contract IDs stored in their own databases.

---

## 1. Canton Network Node Setup and Configuration

### 1.1 Node Topology

The bank operates exactly one Canton node type:

| Node Type | Operator | Purpose |
|----------|----------|---------|
| **Participant Node** | The Bank (Escrow Bank) | Hosts all DAML contracts and all parties; processes choices; stores the bank's view of the ledger; exposes the Ledger API to all off-chain services |

The bank does NOT operate a synchronizer node. Transaction ordering is provided by the Canton Global Synchronizer, to which the bank's participant node connects.

| Node Type | Operator | Bank's Role |
|----------|----------|------------|
| **Global Synchronizer** | Canton Network super-validators | The bank connects to this as a paying participant; it does not operate or control the synchronizer |

**Entities with NO Canton nodes**:

| Entity | Why No Canton Node | How They Interact |
|--------|-------------------|-------------------|
| Bond Issuers (US Treasury) | They operate on TreasuryDirect, Fedwire, DTC | Off-chain: bank purchases bonds via primary dealers and DTC |
| Treasury Providers (primary dealers) | They operate on FIX, SWIFT, DTC | Off-chain: bank's Custody Service sends SWIFT MT541 instructions |
| Regulator (SEC, OCC) | No Canton participation required | Off-chain: bank's Reporting Service submits regulatory reports |
| Investors | Parties on the bank's participant node, not separate nodes | They access the ledger via the bank's Ledger API (port 6865) using JWT auth |

### 1.2 Infrastructure Requirements

#### Bank Participant Node (Production)

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 8 cores | 16 cores |
| RAM | 32 GB | 64 GB |
| Storage | 500 GB SSD (NVMe) | 1 TB SSD (NVMe), with growth capacity |
| Network | 1 Gbps dedicated | 10 Gbps dedicated, redundant uplinks |
| Connectivity | Stable connection to Global Synchronizer sequencer endpoints | Dedicated leased line or high-reliability cloud egress |

#### Software

| Component | Version / Requirement |
|----------|----------------------|
| Canton Enterprise | Latest stable release (coordinate with Digital Asset for enterprise licensing) |
| DAML SDK | 3.4.x (matching Canton release) |
| JVM | OpenJDK 17 LTS or later |
| Database | PostgreSQL 14+ (for Canton participant node storage) |
| Operating System | Ubuntu 22.04 LTS, RHEL 9, or equivalent enterprise Linux |
| Container Runtime | Docker 24+ or containerd |
| Orchestration | Kubernetes 1.28+ (recommended for production) |

### 1.3 Network Configuration

```
                        INTERNET / PRIVATE LEASED LINE
                                    |
                                    | TLS 1.3 (mTLS)
                                    |
                    +---------------+---------------+
                    | Canton Global Synchronizer    |
                    | (operated by super-validators)|
                    | Sequencer endpoints           |
                    +---------------+---------------+
                                    |
                                    | Canton Protocol (mTLS)
                                    |
                    +---------------+---------------+
                    | Bank's Participant Node       |
                    |                               |
                    | - DAML Runtime                |
                    | - Ledger API (port 6865)      |
                    | - Admin API (port 6866, local)|
                    | - PostgreSQL (participant DB) |
                    | - HSM (Canton participant key)|
                    +---------------+---------------+
                                    |
                    +---------------+---------------+
                    | Off-Chain Services (bank)     |
                    |                               |
                    | - API Gateway (port 8080)     |
                    | - KYC Service                 |
                    | - Custody Service → DTC/SWIFT |
                    | - Minting Service             |
                    | - Coupon Service → Fedwire    |
                    | - Redemption Service          |
                    | - Reconciliation Service      |
                    | - Reporting Service → SEC/OCC |
                    | - Investor Portal (React)     |
                    +-------------------------------+
```

#### Port Requirements

| Port | Protocol | Purpose | Access |
|------|----------|---------|--------|
| Varies | gRPC + mTLS | Canton Global Synchronizer connectivity (outbound from participant) | Outbound to Global Synchronizer sequencer URL |
| 6865 | gRPC + TLS | DAML Ledger API (for all off-chain services and Investor Portal) | Application network, JWT-authenticated |
| 6866 | gRPC | Canton Admin API | localhost only; restricted to ops team |
| 6867 | HTTP | gRPC health probe | Internal monitoring |
| 6868 | HTTP | Prometheus metrics | Internal monitoring |
| 5432 | TCP | PostgreSQL database | Internal network only |

#### Firewall Rules

- The participant node's outbound connection to the Global Synchronizer uses mTLS. The specific ports and URLs are provided by the Canton Network.
- Ledger API (port 6865) access must be restricted to authorized application servers and authenticated using JWT tokens.
- Admin API (port 6866) must be restricted to localhost. Remote admin access requires an SSH tunnel or VPN.
- No Canton node ports should be exposed to the public internet.

### 1.4 Canton Configuration

The bank's participant node is configured via HOCON (`canton/config/bank-participant.conf`):

```hocon
canton {
  participants {
    bank {
      storage {
        type = postgres
        config {
          dataSourceClass = "org.postgresql.ds.PGSimpleDataSource"
          properties {
            serverName   = ${CANTON_BANK_DB_HOST}
            portNumber   = 5432
            databaseName = "canton_bank_participant"
            user         = ${CANTON_BANK_DB_USER}
            password     = ${CANTON_BANK_DB_PASSWORD}
          }
        }
        max-connections = 32
      }

      ledger-api {
        address = "0.0.0.0"
        port    = 6865
        tls {
          cert-chain-file       = "/etc/canton/tls/server-cert.pem"
          private-key-file      = "/etc/canton/tls/server-key.pem"
          trust-collection-file = "/etc/canton/tls/ca-cert.pem"
          client-auth           = require  // mTLS for off-chain services
        }
        auth-services = [{
          type = jwt-rs-256-jwks
          url  = ${CANTON_AUTH_JWKS_URL}
        }]
      }

      admin-api {
        address = "127.0.0.1"
        port    = 6866
      }

      // HSM-backed key signing (production)
      // crypto {
      //   provider = tink
      //   kms { type = aws-kms, region = ${AWS_REGION} }
      // }

      parameters {
        journal-garbage-collection-delay = 24h
        reconciliation-interval          = 30s
      }

      topology {
        auto-init = true
      }
    }
  }
}
```

Connecting to the Canton Global Synchronizer (in the bootstrap script):

```scala
// bootstrap.canton
val globalSyncUrl = sys.env.getOrElse("CANTON_GLOBAL_SYNC_URL", "http://localhost:18181")

bank.domains.connect("global-sync", globalSyncUrl)
```

### 1.5 High Availability

Production participant node must be deployed in a high-availability configuration:

- **Active-passive** participant node pair sharing a PostgreSQL database (with streaming replication and automatic failover).
- **Database backup**: Continuous WAL archiving with point-in-time recovery (PITR). RPO: 1 minute. RTO: 15 minutes.
- **Global Synchronizer dependency**: If the Global Synchronizer is temporarily unavailable, the bank's participant node queues pending transactions and resumes when connectivity is restored. The bank should coordinate with the Canton Network on their HA/DR procedures.
- **Cross-region disaster recovery**: Asynchronous replication to a DR site. RTO: 4 hours. RPO: 15 minutes.

---

## 2. DAML Contract Development Standards

### 2.1 DAML SDK and Target

```yaml
# daml.yaml
sdk-version: 3.4.10
name: rwa-tokenization
version: 0.0.1
source: daml
build-options:
  - --target=2.1
dependencies:
  - daml-prim
  - daml-stdlib
```

**Important LF 2.1 constraints**:
- Contract keys (`key` / `maintainer` / `lookupByKey` / `fetchByKey`) are **not supported** in LF 2.1.
- Off-chain services track contract IDs in their own PostgreSQL databases, populated from ledger event streams via `GetTransactions` / `GetTransactionTrees`.
- Use `assertMsg` for precondition checks; use `ensure` for structural invariants.

### 2.2 Module Structure

```
daml/
  RWA/
    Types.daml          -- Shared type definitions (BondMetadata, MonetaryAmount, etc.)
    KYC.daml            -- InvestorKYC, KYCInvitation
    AssetCustody.daml   -- CustodyRecord (bank's DTC holdings attestation)
    EscrowRequest.daml  -- EscrowRequest, ApprovedPurchase, RejectedRequest
    TokenizedBond.daml  -- TokenizedBond, CouponPaymentRecord, RedemptionRequest
daml-tests/
  RWA/Tests/
    KYCTests.daml
    IssuanceTests.daml
    TransferTests.daml
    RedemptionTests.daml
    CouponTests.daml
```

### 2.3 Party Model

There are exactly two institutional roles in DAML:

| DAML Party | Canton Location | Role |
|-----------|----------------|------|
| `escrowBank` | Bank's participant node | Platform operator, qualified custodian, sole signatory on all operational contracts |
| `investor` (one per investor) | Bank's participant node | Token holder; co-signatory on requests; observer on their own tokens |

**Entities that are NOT DAML parties**:

| Entity | Representation in DAML | Off-Chain Integration |
|--------|------------------------|----------------------|
| Bond Issuer (US Treasury) | `BondMetadata.issuerName : Text` | Bank purchases bonds via primary dealers |
| Primary Dealer | `CustodyRecord.dealerReference : Text` | Bank's Custody Service uses SWIFT/FIX |
| Regulator (SEC/OCC) | Not in DAML at all | Bank's Reporting Service exports ledger data to regulatory systems |
| DTC | `CustodyRecord.dtcSettlementRef : Text` | Bank's Custody Service processes SWIFT MT5xx messages |

### 2.4 Signatory and Observer Rules

**Mandatory rules**:

1. `escrowBank` is a signatory on **every** template without exception.
2. The `investor` (or `currentOwner`) is a co-signatory on contracts they initiate or where their consent is required (EscrowRequest, ApprovedPurchase, RejectedRequest, RedemptionRequest).
3. The `investor` / `currentOwner` is an **observer** (not signatory) on `TokenizedBond` and `CouponPaymentRecord`. The bank mints, burns, and records coupons unilaterally as qualified custodian; investor consent is required only for transfers and redemptions.
4. **No `regulator` party**. Regulatory audit data is exported off-chain.
5. **No `bondIssuer` party**. Bond issuer identity is stored as `Text` in `BondMetadata.issuerName`.
6. **No `treasuryProvider` / `custodian` party**. The bank IS the custodian.

**Signatory/Observer summary**:

| Template | Signatories | Observers |
|----------|-------------|-----------|
| `InvestorKYC` | `escrowBank` | `investor` |
| `KYCInvitation` | `escrowBank` | `investor` |
| `CustodyRecord` | `escrowBank` | _(none)_ |
| `EscrowRequest` | `escrowBank, investor` | _(none)_ |
| `ApprovedPurchase` | `escrowBank, investor` | _(none)_ |
| `RejectedRequest` | `escrowBank, investor` | _(none)_ |
| `TokenizedBond` | `escrowBank` | `currentOwner` |
| `CouponPaymentRecord` | `escrowBank` | `investor` |
| `RedemptionRequest` | `escrowBank, investor` | _(none)_ |

### 2.5 Ensure Clauses

All templates must include `ensure` clauses that enforce business invariants:

```daml
template CustodyRecord
  with
    escrowBank        : Party
    metadata          : BondMetadata
    quantity          : Decimal
    totalMintedUnits  : Decimal
    -- ...
  where
    signatory escrowBank

    ensure quantity >= 0.0
        && totalMintedUnits <= quantity   -- 1:1 backing invariant
        && metadata.cusip /= ""
        && dtcSettlementRef /= ""
```

Key invariants to enforce:
- `CustodyRecord`: `totalMintedUnits <= quantity` (1:1 backing)
- `TokenizedBond`: `units > 0.0`
- `EscrowRequest`: `requestedUnits > 0.0 && maxPurchasePrice.amount > 0.0`
- `RedemptionRequest`: `units > 0.0`
- `CouponPaymentRecord`: `couponAmount.amount > 0.0 && paymentRef /= ""`

### 2.6 Choice Design Patterns

#### Single-party controller (bank-operated action)

```daml
-- Bank mints tokens after off-chain DTC settlement is confirmed
choice RecordMinting : ContractId CustodyRecord
  with
    mintedUnits : Decimal
  controller escrowBank
  do
    assertMsg "Minted units must be positive" (mintedUnits > 0.0)
    let newTotal = totalMintedUnits + mintedUnits
    assertMsg "Cannot mint more than custody quantity" (newTotal <= quantity)
    create this with totalMintedUnits = newTotal
```

#### Multi-party controller (requires investor consent)

```daml
-- Investor and bank must both authorize a transfer
choice TransferOwnership : ContractId TokenizedBond
  with
    newOwner    : Party
    transferRef : Text
  controller currentOwner, escrowBank
  do
    assertMsg "Cannot transfer to self" (newOwner /= currentOwner)
    assertMsg "Transfer reference required" (transferRef /= "")
    -- Off-chain: bank's Transfer Service verifies recipient KYC before co-signing
    create this with
      currentOwner    = newOwner
      transferHistory = transferRef :: transferHistory
```

#### Atomic transaction composition

The key pattern for maintaining the 1:1 backing invariant is composing multiple contract operations in a single DAML transaction. The off-chain Minting Service submits a single command batch to the Ledger API that:

1. Exercises `ConfirmCustodyAndMint` on `ApprovedPurchase` (archives it)
2. Exercises `RecordMinting` on `CustodyRecord` (updates `totalMintedUnits`)
3. Creates `TokenizedBond` (gives investor their token)

All three operations are atomic — they either all succeed or all fail. This guarantees the 1:1 backing invariant cannot be violated.

### 2.7 Error Handling

- Use `assertMsg` with descriptive messages for all precondition checks.
- All error messages must include enough context to diagnose the issue:

```daml
assertMsg ("Minting would exceed custody quantity: minted=" <> show newTotal
           <> " quantity=" <> show quantity)
          (newTotal <= quantity)
```

- Never silently swallow errors or return default values for failed operations.

---

## 3. Smart Contract Security Audit Requirements

### 3.1 Pre-Audit Checklist

- [ ] All DAML modules compile without errors or warnings (`daml build`)
- [ ] All unit tests pass (`daml test`)
- [ ] Code coverage exceeds 90% for all choice bodies and ensure clauses
- [ ] No use of unsafe functions in production code
- [ ] All parties are properly authorized (signatory/observer/controller review against the table in §2.4)
- [ ] All business invariants are enforced with `ensure` clauses
- [ ] Atomic composition of minting/redemption transactions is verified
- [ ] Privacy model has been reviewed (Investor A cannot see Investor B's `TokenizedBond`)
- [ ] No contract keys used (not supported in LF 2.1)

### 3.2 Common DAML Vulnerabilities to Prevent

| Vulnerability | Description | Prevention |
|-------------|-------------|------------|
| Missing authorization check | A choice can be exercised by an unauthorized party | Always use explicit `controller` declarations |
| Missing KYC validation | Token transfer proceeds without verifying recipient identity | Off-chain Transfer Service verifies `InvestorKYC` contract ID before co-signing `TransferOwnership` |
| Non-atomic mint/burn | Custody position updated without corresponding token creation/archival | Always compose `CustodyRecord` update with `TokenizedBond` creation/archival in the same DAML command batch |
| Privacy leak | Investor sees another investor's `TokenizedBond` | `TokenizedBond` has `observer currentOwner` only — not a list of all investors |
| Over-minting | More tokens minted than custody quantity | `CustodyRecord.ensure totalMintedUnits <= quantity` prevents this at the DAML runtime level |

### 3.3 Static Analysis

```bash
# Compile with zero warnings
daml build

# Run all tests
daml test --junit-report test-results.xml

# Generate documentation
daml damlc docs --output docs/daml-docs --format html
```

---

## 4. KYC/AML API Integration

### 4.1 KYC Provider Integration

The KYC Service triggers the off-chain identity verification flow when an investor accepts a `KYCInvitation` on the Canton ledger.

```
Investor accepts       Bank's          KYC Provider        Canton Ledger
KYCInvitation   -->   KYC Service -->  API (Jumio/Onfido) --> Create InvestorKYC
(DAML event)          (ledger stream   (REST/HTTPS)           (DAML contract,
                       consumer)                              signatory=escrowBank)
```

#### API Specification

| Field | Specification |
|-------|--------------|
| Provider | Jumio, Onfido, LexisNexis Risk Solutions, or equivalent |
| Protocol | REST over HTTPS (TLS 1.3) |
| Authentication | OAuth 2.0 client credentials or API key |
| Data sent | Name, date of birth, nationality, document images (stored off-chain only) |
| Data received | Verification result, risk score, watchlist screening results |
| On-ledger | Only `kycProviderRef` (reference ID) — full PII stays in KYC provider's system |

#### Resulting DAML Contract

```daml
-- Created by the KYC Service after Jumio/Onfido returns "pass"
-- and OFAC screening clears
template InvestorKYC
  with
    investor          : Party      -- Canton party on bank's node
    escrowBank        : Party
    fullName          : Text
    jurisdiction      : Text       -- ISO 3166-1 alpha-2
    accreditation     : AccreditationLevel
    isAccredited      : Bool
    amlCleared        : Bool
    sanctionsCleared  : Bool
    status            : KYCStatus
    kycProviderRef    : Text       -- Jumio verification ID (not PII itself)
    -- ... dates
  where
    signatory escrowBank
    observer investor
```

### 4.2 Investor Party Allocation

When an investor registers on the Investor Portal, before KYC is triggered, the bank's onboarding service allocates a Canton party for the investor via the Admin API:

```bash
# Called by the bank's Onboarding Service (via Admin API, port 6866)
# NOT via the Ledger API — this is an administrative operation
curl -X POST http://localhost:6866/v1/parties/allocate \
  -H "Content-Type: application/json" \
  -d '{"partyIdHint": "InvestorJohnDoe", "displayName": "John Doe"}'
```

The returned party ID is stored in the investor's profile in the bank's off-chain database. From that point on:
- The investor's JWT tokens include this party ID in the `actAs` claim.
- The Investor Portal uses this JWT to submit DAML commands to the Ledger API (port 6865) on behalf of the investor.

### 4.3 Sanctions Screening

Real-time OFAC screening must be performed by the bank's Transfer Service:
- At investor onboarding (before `InvestorKYC` creation).
- Before every `TransferOwnership` co-signature by the bank.
- Daily batch screening of all active `TokenizedBond` holder party IDs.

---

## 5. Oracle and Off-Chain Data Integration

### 5.1 Data Sources Required

| Data Type | Source | Update Frequency | Use Case |
|----------|--------|-----------------|----------|
| Treasury yields / pricing | Bloomberg BVAL, Refinitiv, FRED | Real-time or EOD | Bond valuation, NAV calculation |
| Coupon payment schedules | DTC (MT564 corporate action) | Per event | Trigger `RecordCouponPayment` on `TokenizedBond` |
| Maturity events | DTC (MT564) | Per event | Trigger redemption workflow |
| Reference data (CUSIP, ISIN) | CUSIP Global Services | Static | Validate `BondMetadata` fields |
| DTC custody balances | DTC Position API (MT535) | Daily | Proof-of-reserves reconciliation |

### 5.2 Off-Chain Service Event Loop Pattern

All off-chain services follow the same pattern:

```
Canton Ledger API (GetTransactions stream)
        |
        | gRPC transaction stream
        v
+-------+-------+
| Event Router  |   filters by template/choice
+-------+-------+
        |
  +-----+------+------+--------+----------+
  |     |      |      |        |          |
 KYC  Custody Minting Coupon Redemption Reporting
 Svc  Svc     Svc     Svc    Svc        Svc
  |     |      |      |        |          |
  v     v      v      v        v          v
Jumio  SWIFT  Ledger Fedwire  Fedwire   SEC/OCC
/Onfido MT541  API   Funds   Funds     Reports
        DTC    (write         ACH
        MT545  back)
```

### 5.3 Reconciliation Service

```python
# Pseudocode — Daily reconciliation
def reconcile():
    # Query on-ledger: active TokenizedBond contracts grouped by CUSIP
    on_ledger = {}
    for contract in ledger_api.query(TokenizedBond, filter={"escrowBank": ESCROW_BANK_PARTY}):
        cusip = contract.payload["metadata"]["cusip"]
        on_ledger[cusip] = on_ledger.get(cusip, 0) + contract.payload["units"]

    # Query on-ledger: CustodyRecord totalMintedUnits per CUSIP
    custody_on_ledger = {}
    for record in ledger_api.query(CustodyRecord, filter={"escrowBank": ESCROW_BANK_PARTY}):
        cusip = record.payload["metadata"]["cusip"]
        custody_on_ledger[cusip] = record.payload["totalMintedUnits"]

    # Query off-chain: DTC MT535 position statement
    dtc_positions = dtc_api.get_positions(account=BANK_DTC_ACCOUNT)

    for cusip in set(on_ledger) | set(dtc_positions):
        token_supply = on_ledger.get(cusip, 0)
        custody_minted = custody_on_ledger.get(cusip, 0)
        dtc_balance = dtc_positions.get(cusip, 0)

        if token_supply != custody_minted:
            alert(f"On-ledger mismatch for {cusip}: TokenizedBond sum={token_supply}, CustodyRecord.totalMintedUnits={custody_minted}")
        if custody_minted > dtc_balance:
            alert(f"CRITICAL: Over-tokenized {cusip}: minted={custody_minted}, DTC balance={dtc_balance}")

    audit_log.info("Reconciliation complete", results=on_ledger)
```

---

## 6. Key Management and HSM Requirements

### 6.1 Key Types

| Key | Purpose | Storage | Rotation |
|-----|---------|---------|----------|
| Canton Participant Identity Key | Authenticates the bank's participant node to the Global Synchronizer | HSM (FIPS 140-2 Level 3) | Annual or upon compromise |
| `escrowBank` Party Signing Key | Signs DAML transactions submitted as the `escrowBank` party | HSM (FIPS 140-2 Level 3) | Annual or upon compromise |
| TLS Server Certificate Key | TLS for Ledger API | HSM or secure key store | Annual |
| Database Encryption Key | Encryption at rest for Canton PostgreSQL database | HSM or KMS | Annual |

### 6.2 HSM Requirements

| Requirement | Specification |
|------------|--------------|
| Certification | FIPS 140-2 Level 3 (minimum) or FIPS 140-3 Level 3 |
| Supported algorithms | ECDSA (P-256), Ed25519 |
| High availability | Dual HSM in active-passive configuration |
| Backup | Secure key backup to offline HSM with split knowledge / dual control |
| Access control | M-of-N authentication for key ceremony operations |
| Vendor options | Thales Luna Network HSM, Entrust nShield, AWS CloudHSM, Azure Dedicated HSM |

### 6.3 Key Ceremony

Initial key generation must follow a formal key ceremony for the Canton participant identity key and the `escrowBank` party signing key:

1. Generate keys inside the HSM; keys never leave the HSM boundary in plaintext.
2. Minimum 3 key ceremony officers with M-of-N credentials (e.g., 2-of-3).
3. Create encrypted key backup in a physically separate, access-controlled location.
4. Record and witness the ceremony in a signed log.
5. Verify key generation by signing a test DAML transaction and confirming the signature.

---

## 7. Testing, Staging, and Production Deployment

### 7.1 Environment Tiers

| Environment | Purpose | Canton Config | Data |
|------------|---------|---------------|------|
| **Local development** | Developer workstation | `daml sandbox` or Canton Community sandbox | Synthetic test data |
| **Integration (CI)** | Automated testing in CI/CD | Canton Community in Docker + local sandbox sequencer | Synthetic test data |
| **Staging** | Pre-production validation, UAT | Canton Enterprise participant + test Global Synchronizer endpoint | Anonymized production-like data |
| **Production** | Live platform | Canton Enterprise participant + Canton Global Synchronizer | Real data |

### 7.2 Testing Requirements

| Test Type | Tool | Coverage Requirement | When |
|----------|------|---------------------|------|
| DAML unit tests | `daml test` | 90%+ code coverage | Every commit (CI) |
| DAML scenario tests | `daml test` (script-based) | All happy paths + key error paths | Every commit (CI) |
| Integration tests | Ledger API test harness | All cross-module workflows (KYC → Purchase → Mint → Transfer → Coupon → Redemption) | Every PR merge (CI) |
| Authorization tests | Ledger API | Verify unauthorized choice exercises fail with expected error | Every PR merge (CI) |
| Privacy tests | Ledger API | Verify Investor A cannot read Investor B's `TokenizedBond` | Every PR merge (CI) |
| 1:1 backing invariant tests | DAML scenario | Verify over-minting raises `ensure` violation | Every commit (CI) |
| Performance tests | Load generator | Sustain 100 TPS for 1 hour, p99 latency < 2s | Weekly (staging) |

### 7.3 CI/CD Pipeline

```
Developer push --> GitHub/GitLab CI
    |
    +--> daml build (compile, zero warnings)
    +--> daml test (unit + scenario tests)
    +--> Authorization tests (verify unauthorized choices fail)
    +--> Privacy tests (verify inter-investor isolation)
    +--> Integration tests (full 6-phase lifecycle in sandbox)
    |
    +--> [On merge to main]
    |     +--> Build Docker images
    |     +--> Deploy to staging (Canton Enterprise + test Global Sync endpoint)
    |     +--> Integration + performance tests on staging
    |     +--> UAT sign-off (manual gate)
    |
    +--> [On release tag]
          +--> Smart contract audit sign-off (manual gate)
          +--> Deploy to production (blue-green)
          +--> Post-deployment smoke tests
          +--> Monitor for 24 hours
```

### 7.4 DAML Contract Upgrade Strategy

Canton supports DAML contract upgrades. For each upgrade:

1. **Backward compatibility**: New contract versions must not break existing contracts in active state.
2. **Version management**: Increment the minor version for backward-compatible changes; major version for breaking changes.
3. **Migration scripts**: For breaking changes, develop DAML scripts that migrate existing contracts. Test migrations thoroughly on staging.
4. **Rollback plan**: Document and test rollback procedures for every production deployment.
5. **Change advisory board (CAB)**: All production contract changes must be approved by the CAB.

### 7.5 Production Deployment Checklist

- [ ] All tests pass on staging (unit, integration, performance, security)
- [ ] UAT sign-off obtained
- [ ] Smart contract audit sign-off (for contract changes)
- [ ] Compliance review sign-off (for business logic changes)
- [ ] CAB approval
- [ ] Rollback plan documented and tested
- [ ] Monitoring alerts configured
- [ ] On-call team briefed
- [ ] Change management ticket created and approved
- [ ] Database backup verified (pre-deployment)
- [ ] Global Synchronizer connectivity verified from staging and production environments

---

## 8. Incident Response and Business Continuity

### 8.1 Incident Severity Classification

| Severity | Description | Response Time | Example |
|----------|-------------|---------------|---------|
| **P1 — Critical** | Platform down or data integrity compromised | 15 minutes | Participant node crash; reconciliation failure showing over-tokenization |
| **P2 — High** | Significant functionality impaired | 1 hour | Global Synchronizer connectivity degraded; transfers failing |
| **P3 — Medium** | Minor functionality impaired | 4 hours | Reporting lag; non-critical API timeout |
| **P4 — Low** | Minor issue | Next business day | UI display issue; non-blocking log warning |

### 8.2 Business Continuity Plan

| Scenario | RTO | RPO | Recovery Procedure |
|----------|-----|-----|-------------------|
| Bank participant node failure | 15 min | 0 (synchronous HA) | Automatic failover to standby node |
| Global Synchronizer unavailable | Depends on DA SLA | 0 | Halt DAML command submissions; queue pending operations; resume when connectivity restored |
| Database failure | 15 min | 1 min | Automatic failover to PostgreSQL replica |
| Full data center outage | 4 hours | 15 min | Activate DR site; restore from async replicated DB; reconnect to Global Synchronizer |
| Participant key compromise | 1 hour | N/A | Revoke compromised key; perform key rotation ceremony; reissue participant identity |

### 8.3 Global Synchronizer Dependency

The bank's participant node depends on the Canton Global Synchronizer. If the synchronizer is unavailable:
- No new DAML transactions can be submitted or committed.
- The bank should monitor the Canton Network status page and establish communication with Digital Asset support.
- Establish a runbook for suspending investor-facing operations during Global Synchronizer outages.

---

## 9. Monitoring and Observability

### 9.1 Required Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Canton participant node health | Canton health endpoint (port 6867) | Unhealthy for > 30 seconds |
| Global Synchronizer connectivity | Canton metrics | Disconnected for > 60 seconds |
| DAML command submission latency (p99) | Ledger API metrics (Prometheus, port 6868) | > 5 seconds |
| DAML command completion rate | Ledger API metrics | < 99% over 5 minutes |
| PostgreSQL connection pool utilization | Database metrics | > 80% |
| Daily reconciliation result | Reconciliation Service | Any mismatch (over-tokenization = P1 alert) |
| HSM availability | HSM monitoring agent | Unavailable for > 10 seconds |
| TLS certificate expiration | Certificate monitoring | < 30 days to expiry |

### 9.2 Logging Requirements

- All logs must use structured JSON format.
- DAML command submissions and completions must be logged with: party, command ID, workflow ID, template name, choice name.
- All off-chain API calls (KYC provider, DTC/Fedwire, payment rails) must be logged with: request ID, endpoint, HTTP status, latency.
- Logs must be retained for a minimum of 7 years.
- PII must not appear in log messages. Use `kycProviderRef` and party IDs (not investor names) in logs.

---

## 10. Development Environment Setup

### 10.1 Prerequisites

```bash
# 1. Install DAML SDK
curl -sSL https://get.daml.com/ | sh
daml version  # Verify: should show 3.4.x

# 2. Install PostgreSQL (for local Canton storage)
brew install postgresql@14  # macOS

# 3. Install Java 17
brew install openjdk@17  # macOS

# 4. Install Canton Community Edition (for local sandbox sequencer)
# Download from: https://github.com/digital-asset/canton/releases
# Extract and add bin/ to PATH

# 5. Clone the project repository
git clone <repo-url> rwa-tokenization
cd rwa-tokenization
```

### 10.2 Local Build and Test

```bash
# Build DAML packages (must produce zero warnings)
daml build

# Run unit tests
daml test

# Start local Canton sandbox (acts as local synchronizer for dev)
canton run --config canton/config/bank-participant.conf \
           --bootstrap canton/bootstrap.canton

# Or use daml sandbox for simpler local development
daml sandbox --port 6865
```

### 10.3 IDE Setup

- **Recommended IDE**: Visual Studio Code with the DAML extension (published by Digital Asset).
- **Extension features**: Syntax highlighting, type checking, code navigation, inline error reporting.
- **Configuration**: The DAML extension uses the `daml.yaml` in the project root. SDK version in `daml.yaml` must match the installed SDK.

---

## Appendix A: DAML SDK Version Compatibility Matrix

| Platform Version | DAML SDK | Canton | LF Target | PostgreSQL | JVM |
|-----------------|----------|--------|-----------|------------|-----|
| 0.0.1 (current) | 3.4.10 | 3.x Enterprise | 2.1 | 14+ | OpenJDK 17 |

## Appendix B: Known LF 2.1 Limitations

| Feature | Status in LF 2.1 | Workaround |
|---------|-----------------|------------|
| Contract keys (`key` / `maintainer`) | Not supported | Off-chain services store contract IDs in PostgreSQL, populated from ledger event streams |
| `lookupByKey` / `fetchByKey` | Not supported | Query by contract ID (stored off-chain) or scan active contracts |
| `getTime` in `ensure` clauses | Not supported | Validate time-based conditions in choice bodies using `getTime` |
